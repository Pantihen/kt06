require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Переменная окружения ${name} не задана (см. .env.example)`);
  }
  return value;
}

const jwt = {
  accessSecret: required('JWT_ACCESS_SECRET'),
  refreshSecret: required('JWT_REFRESH_SECRET'),
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

required('DATABASE_URL');

// Один экземпляр PrismaClient на всё приложение.
// Поле password никогда не попадает в ответы (глобальный omit).
const prisma = new PrismaClient({
  omit: { user: { password: true } },
});

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  isProduction,
  // Сколько прокси перед приложением (Render/Railway — 1). Нужно для корректного IP в rate limit
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  redisUrl: process.env.REDIS_URL || '',
  pagination: { defaultLimit: 10, maxLimit: 100 },
  bcryptRounds: 10,
  bodyLimit: '10kb',
  jwt,
  refreshCookie: {
    name: 'refreshToken',
    path: '/auth',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  rateLimit: {
    login: { windowMs: 15 * 60 * 1000, limit: 10 },
  },
  chat: {
    corsOrigin: (process.env.CLIENT_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    historyLimit: Number(process.env.CHAT_HISTORY_LIMIT) || 50,
    maxMessageLength: Number(process.env.CHAT_MAX_MESSAGE_LENGTH) || 1000,
    maxRoomNameLength: 50,
  },
  prisma,
};
