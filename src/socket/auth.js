const { prisma } = require('../config');
const { verifyAccessToken } = require('../utils/jwt');

function unauthorized(message) {
  const err = new Error(message);
  err.data = { status: 401 };
  return err;
}

// Токен: io(url, { auth: { token } }) или заголовок Authorization: Bearer <token>
function extractToken(handshake) {
  if (handshake.auth?.token) return handshake.auth.token;
  const [scheme, token] = (handshake.headers.authorization || '').split(' ');
  return scheme === 'Bearer' ? token : null;
}

// Middleware Socket.io: проверяет JWT и кладёт пользователя из БД в socket.data.user
async function socketAuth(socket, next) {
  const token = extractToken(socket.handshake);
  if (!token) return next(unauthorized('Требуется авторизация'));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(unauthorized('Недействительный или просроченный токен'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return next(unauthorized('Пользователь не найден'));

    socket.data.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { socketAuth };
