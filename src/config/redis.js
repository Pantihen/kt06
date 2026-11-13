const Redis = require('ioredis');
const { redisUrl } = require('./index');

// Клиент Redis создаётся, только если задан REDIS_URL.
// Без него rate limit и список отозванных токенов хранятся в памяти процесса (тесты, локальный запуск).
const redis = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: 3, enableOfflineQueue: true })
  : null;

if (redis) {
  redis.on('error', (err) => console.error(`[redis] ${err.message}`));
}

module.exports = { redis };
