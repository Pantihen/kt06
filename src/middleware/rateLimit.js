const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { rateLimit: limits } = require('../config');
const { redis } = require('../config/redis');
const { AppError } = require('../utils/errors');

// С Redis счётчики общие для всех экземпляров приложения и переживают перезапуск
function storeFor(prefix) {
  if (!redis) return undefined; // MemoryStore по умолчанию
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (command, ...args) => redis.call(command, ...args),
  });
}

// POST /auth/login: не более 10 попыток за 15 минут с одного IP
const loginLimiter = rateLimit({
  windowMs: limits.login.windowMs,
  limit: limits.login.limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: storeFor('login'),
  handler: (req, res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Слишком много попыток входа, попробуйте через 15 минут')),
});

module.exports = { loginLimiter };
