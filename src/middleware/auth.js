const { prisma } = require('../config');
const { verifyAccessToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/errors');

// Аутентификация: заголовок Authorization: Bearer <accessToken>.
// Пользователь загружается из БД — роль всегда актуальна, удалённый пользователь не пройдёт.
async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Требуется авторизация');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Недействительный или просроченный токен');
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) throw unauthorized('Пользователь не найден');

  req.user = user;
  next();
}

module.exports = { authenticate };
