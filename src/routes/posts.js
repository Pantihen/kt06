const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authorizeOwnerOr, STAFF } = require('../middleware/rbac');
const { notFound } = require('../utils/errors');
const { send, created, noContent, paginationMeta } = require('../utils/response');
const { authorInclude, commentInclude } = require('./includes');

const router = express.Router();

router.use(authenticate);

const postInclude = {
  author: authorInclude,
  tags: true,
  _count: { select: { comments: true } },
};

// Массив имён тегов -> connectOrCreate (существующие подключаются, новые создаются)
function tagsConnectOrCreate(tags) {
  return tags.map((name) => ({ where: { name }, create: { name } }));
}

// Владелец поста — его автор
async function postOwnerId(req) {
  const post = await prisma.post.findUnique({
    where: { id: req.validated.params.id },
    select: { authorId: true },
  });
  return post ? post.authorId : null;
}

// USER — только свои посты, MODERATOR и ADMIN — любые
const canModifyPost = authorizeOwnerOr(postOwnerId, ...STAFF);

// GET /api/posts — список с фильтрацией и пагинацией
router.get('/', validate(schemas.postQuery, 'query'), async (req, res) => {
  const { search, published, authorId, tag, page, limit } = req.validated.query;

  const where = {};
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (published !== undefined) where.published = published;
  if (authorId !== undefined) where.authorId = authorId;
  if (tag) where.tags = { some: { name: tag } };

  const [data, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: postInclude,
    }),
    prisma.post.count({ where }),
  ]);

  send(res, data, { meta: paginationMeta(total, page, limit) });
});

// GET /api/posts/:id — пост с автором, тегами и последними комментариями
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.validated.params.id },
    include: {
      ...postInclude,
      comments: { orderBy: { createdAt: 'desc' }, take: 10, include: commentInclude },
    },
  });
  if (!post) throw notFound('Пост не найден');
  send(res, post);
});

// POST /api/posts — автор = текущий пользователь
router.post('/', validate(schemas.postCreate), async (req, res) => {
  const { tags = [], ...data } = req.validated.body;
  const post = await prisma.post.create({
    data: {
      ...data,
      authorId: req.user.id,
      tags: { connectOrCreate: tagsConnectOrCreate(tags) },
    },
    include: postInclude,
  });
  created(res, post);
});

// PATCH /api/posts/:id — tags заменяет набор тегов целиком
router.patch(
  '/:id',
  validate(schemas.idParam, 'params'),
  canModifyPost,
  validate(schemas.postUpdate),
  async (req, res) => {
    const { tags, ...data } = req.validated.body;
    if (tags) data.tags = { set: [], connectOrCreate: tagsConnectOrCreate(tags) };

    const post = await prisma.post.update({
      where: { id: req.validated.params.id },
      data,
      include: postInclude,
    });
    send(res, post);
  }
);

// DELETE /api/posts/:id — комментарии удаляются каскадно
router.delete('/:id', validate(schemas.idParam, 'params'), canModifyPost, async (req, res) => {
  await prisma.post.delete({ where: { id: req.validated.params.id } });
  noContent(res);
});

module.exports = router;
