const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authorizeOwnerOr, STAFF } = require('../middleware/rbac');
const { notFound } = require('../utils/errors');
const { send, created, noContent, paginationMeta } = require('../utils/response');
const { commentInclude } = require('./includes');

// Комментарии вложены в посты для списка и создания,
// а для работы с конкретным комментарием используется /api/comments/:id
const postComments = express.Router({ mergeParams: true });
const comments = express.Router();

postComments.use(authenticate);
comments.use(authenticate);

async function assertPostExists(postId) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw notFound('Пост не найден');
}

// Владелец комментария — его автор
async function commentOwnerId(req) {
  const comment = await prisma.comment.findUnique({
    where: { id: req.validated.params.id },
    select: { authorId: true },
  });
  return comment ? comment.authorId : null;
}

// USER — только свои комментарии, MODERATOR и ADMIN — любые
const canModifyComment = authorizeOwnerOr(commentOwnerId, ...STAFF);

// GET /api/posts/:postId/comments — комментарии поста с фильтрацией и пагинацией
postComments.get(
  '/',
  validate(schemas.postIdParam, 'params'),
  validate(schemas.commentQuery, 'query'),
  async (req, res) => {
    const { postId } = req.validated.params;
    const { authorId, page, limit } = req.validated.query;
    await assertPostExists(postId);

    const where = { postId };
    if (authorId !== undefined) where.authorId = authorId;

    const [data, total] = await prisma.$transaction([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: commentInclude,
      }),
      prisma.comment.count({ where }),
    ]);

    send(res, data, { meta: paginationMeta(total, page, limit) });
  }
);

// POST /api/posts/:postId/comments — автор = текущий пользователь
postComments.post(
  '/',
  validate(schemas.postIdParam, 'params'),
  validate(schemas.commentCreate),
  async (req, res) => {
    const { postId } = req.validated.params;
    await assertPostExists(postId);

    const comment = await prisma.comment.create({
      data: { content: req.validated.body.content, postId, authorId: req.user.id },
      include: commentInclude,
    });
    created(res, comment);
  }
);

// GET /api/comments/:id
comments.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const comment = await prisma.comment.findUnique({
    where: { id: req.validated.params.id },
    include: commentInclude,
  });
  if (!comment) throw notFound('Комментарий не найден');
  send(res, comment);
});

// PATCH /api/comments/:id
comments.patch(
  '/:id',
  validate(schemas.idParam, 'params'),
  canModifyComment,
  validate(schemas.commentUpdate),
  async (req, res) => {
    const comment = await prisma.comment.update({
      where: { id: req.validated.params.id },
      data: { content: req.validated.body.content },
      include: commentInclude,
    });
    send(res, comment);
  }
);

// DELETE /api/comments/:id
comments.delete('/:id', validate(schemas.idParam, 'params'), canModifyComment, async (req, res) => {
  await prisma.comment.delete({ where: { id: req.validated.params.id } });
  noContent(res);
});

module.exports = { postComments, comments };
