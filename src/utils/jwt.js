const crypto = require('crypto');
const jsonwebtoken = require('jsonwebtoken');
const { jwt } = require('../config');

function payloadFor(user) {
  return { sub: String(user.id), role: user.role };
}

function signAccessToken(user) {
  return jsonwebtoken.sign(payloadFor(user), jwt.accessSecret, { expiresIn: jwt.accessExpiresIn });
}

// У refresh-токена есть уникальный jti — по нему токен можно отозвать (logout, ротация)
function signRefreshToken(user) {
  return jsonwebtoken.sign(payloadFor(user), jwt.refreshSecret, {
    expiresIn: jwt.refreshExpiresIn,
    jwtid: crypto.randomUUID(),
  });
}

// Бросают ошибку, если токен подделан, просрочен или подписан другим секретом
function verifyAccessToken(token) {
  return jsonwebtoken.verify(token, jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jsonwebtoken.verify(token, jwt.refreshSecret);
}

// Сколько секунд токену осталось жить (для TTL записи в Redis)
function secondsUntilExpiry(payload) {
  return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  secondsUntilExpiry,
};
