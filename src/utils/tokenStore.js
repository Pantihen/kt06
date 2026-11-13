const { redis } = require('../config/redis');

// Список отозванных refresh-токенов (по jti).
// Redis: ключ с TTL = оставшееся время жизни токена, после истечения запись исчезает сама.
// Без Redis — Map в памяти процесса.
const PREFIX = 'revoked:';
const memory = new Map(); // jti -> expiresAt (ms)

async function revoke(jti, ttlSeconds) {
  if (!jti) return;
  if (redis) {
    await redis.set(`${PREFIX}${jti}`, '1', 'EX', ttlSeconds);
    return;
  }
  memory.set(jti, Date.now() + ttlSeconds * 1000);
}

async function isRevoked(jti) {
  if (!jti) return true;
  if (redis) {
    return (await redis.exists(`${PREFIX}${jti}`)) === 1;
  }
  const expiresAt = memory.get(jti);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    memory.delete(jti);
    return false;
  }
  return true;
}

module.exports = { revoke, isRevoked };
