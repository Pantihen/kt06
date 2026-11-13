const express = require('express');
const { prisma, isProduction, refreshCookie } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  secondsUntilExpiry,
} = require('../utils/jwt');
const tokenStore = require('../utils/tokenStore');
const { unauthorized } = require('../utils/errors');
const { send, created, noContent } = require('../utils/response');

const router = express.Router();

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: refreshCookie.path,
};

function setRefreshCookie(res, user) {
  res.cookie(refreshCookie.name, signRefreshToken(user), {
    ...cookieOptions,
    maxAge: refreshCookie.maxAgeMs,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(refreshCookie.name, cookieOptions);
}

// Проверяет refresh-токен из cookie: подпись, срок и что он не отозван
async function readRefreshToken(req) {
  const token = req.cookies?.[refreshCookie.name];
  if (!token) return null;
  try {
    const payload = verifyRefreshToken(token);
    return (await tokenStore.isRevoked(payload.jti)) ? null : payload;
  } catch {
    return null;
  }
}

// POST /auth/register — регистрация, пароль хэшируется bcrypt, роль всегда USER
router.post('/register', validate(schemas.register), async (req, res) => {
  const { email, name, password } = req.validated.body;
  const user = await prisma.user.create({
    data: { email, name, password: await hashPassword(password) },
  });
  created(res, user);
});

// POST /auth/login — access token в теле ответа, refresh token в httpOnly cookie
router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await prisma.user.findUnique({
    where: { email },
    omit: { password: false },
  });
  if (!user || !(await comparePassword(password, user.password))) {
    throw unauthorized('Неверный email или пароль');
  }

  const { password: _hash, ...safeUser } = user;
  setRefreshCookie(res, user);
  send(res, { accessToken: signAccessToken(user), user: safeUser });
});

// POST /auth/refresh — новый access token; refresh token ротируется, старый отзывается
router.post('/refresh', async (req, res) => {
  const payload = await readRefreshToken(req);
  if (!payload) {
    clearRefreshCookie(res);
    throw unauthorized('Refresh token отсутствует, недействителен или отозван');
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) {
    clearRefreshCookie(res);
    throw unauthorized('Пользователь не найден');
  }

  await tokenStore.revoke(payload.jti, secondsUntilExpiry(payload));
  setRefreshCookie(res, user);
  send(res, { accessToken: signAccessToken(user) });
});

// POST /auth/logout — отзывает refresh token и очищает cookie
router.post('/logout', async (req, res) => {
  const payload = await readRefreshToken(req);
  if (payload) await tokenStore.revoke(payload.jti, secondsUntilExpiry(payload));
  clearRefreshCookie(res);
  noContent(res);
});

// GET /auth/me — текущий пользователь
router.get('/me', authenticate, (req, res) => {
  send(res, req.user);
});

module.exports = router;
