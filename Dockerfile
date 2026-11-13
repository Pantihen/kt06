# ---------- базовый образ ----------
FROM node:22-alpine AS base
# OpenSSL нужен движку Prisma
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# ---------- зависимости и Prisma Client ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate

# ---------- итоговый образ ----------
FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public

# Не запускаем приложение от root
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" > /dev/null || exit 1

# При старте: применить миграции, создать первого админа (если задан в .env), запустить сервер.
# exec — чтобы Node получал SIGTERM напрямую и корректно завершался.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && exec node src/server.js"]
