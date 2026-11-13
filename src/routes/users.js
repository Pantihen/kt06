const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authorize, authorizeOwnerOr, ROLES, STAFF } = require('../middleware/rbac');
const { hashPassword } = require('../utils/password');
const { notFound } = require('../utils/errors');
const { send, created, noContent, paginationMeta } = require('../utils/response');

const router = express.Router();

router.use(authenticate);

// Владелец профиля — сам пользователь
async function userOwnerId(req) {
  const user = await prisma.user.findUnique({
    where: { id: req.validated.params.id },
    select: { id: true },
  });
  return user ? user.id : null;
}

// GET /api/users — список с фильтрацией и пагинацией (MODERATOR, ADMIN)
router.get('/', authorize(...STAFF), validate(schemas.userQuery, 'query'), async (req, res) => {
  const { role, search, page, limit } = req.validated.query;

  const where = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { id: 'asc' },
      include: { _count: { select: { posts: true, comments: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  send(res, data, { meta: paginationMeta(total, page, limit) });
});

// GET /api/users/:id — пользователь с постами (новые сверху)
router.get('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.validated.params.id },
    include: {
      posts: {
        orderBy: { createdAt: 'desc' },
        include: { tags: true, _count: { select: { comments: true } } },
      },
    },
  });
  if (!user) throw notFound('Пользователь не найден');
  send(res, user);
});

// POST /api/users — создать пользователя с любой ролью (ADMIN).
// Обычная регистрация — POST /auth/register
router.post('/', authorize(ROLES.ADMIN), validate(schemas.userCreate), async (req, res) => {
  const { password, ...data } = req.validated.body;
  const user = await prisma.user.create({
    data: { ...data, password: await hashPassword(password) },
  });
  created(res, user);
});

// PATCH /api/users/:id — свой профиль или ADMIN. Роль меняется только через /admin
router.patch(
  '/:id',
  validate(schemas.idParam, 'params'),
  authorizeOwnerOr(userOwnerId, ROLES.ADMIN),
  validate(schemas.userUpdate),
  async (req, res) => {
    const data = { ...req.validated.body };
    if (data.password) data.password = await hashPassword(data.password);

    const user = await prisma.user.update({ where: { id: req.validated.params.id }, data });
    send(res, user);
  }
);

// DELETE /api/users/:id — свой аккаунт или ADMIN (посты, комментарии и сообщения — каскадно)
router.delete(
  '/:id',
  validate(schemas.idParam, 'params'),
  authorizeOwnerOr(userOwnerId, ROLES.ADMIN),
  async (req, res) => {
    await prisma.user.delete({ where: { id: req.validated.params.id } });
    noContent(res);
  }
);

module.exports = router;
