// Один раз перед всеми тестами: пересоздаёт тестовую схему и применяет миграции.
// Нужен запущенный PostgreSQL: docker compose up -d db
require('dotenv').config({ quiet: true });
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL не задан — скопируйте .env.example в .env');

  const schema = new URL(url).searchParams.get('schema');
  if (!schema || schema === 'public') {
    throw new Error('TEST_DATABASE_URL должен указывать на отдельную схему, например ?schema=test');
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } catch (err) {
    throw new Error(`PostgreSQL недоступен (${err.message.split('\n')[0]}). Запустите: docker compose up -d db`);
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
};
