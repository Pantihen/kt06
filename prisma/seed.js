// Создаёт первого администратора (и, по желанию, модератора) из переменных окружения.
// Запуск: npm run seed. В Docker выполняется автоматически при старте контейнера.
// Без SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD ничего не делает — паролей в коде нет.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const accounts = [
  {
    role: 'ADMIN',
    name: 'Admin',
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    role: 'MODERATOR',
    name: 'Moderator',
    email: process.env.SEED_MODERATOR_EMAIL,
    password: process.env.SEED_MODERATOR_PASSWORD,
  },
];

async function main() {
  for (const { password, ...data } of accounts) {
    if (!data.email || !password) {
      console.log(`[seed] ${data.role}: SEED_${data.role}_EMAIL/PASSWORD не заданы — пропуск`);
      continue;
    }
    // Существующему пользователю меняется только роль, пароль не перезаписывается
    await prisma.user.upsert({
      where: { email: data.email.toLowerCase() },
      update: { role: data.role },
      create: { ...data, email: data.email.toLowerCase(), password: await bcrypt.hash(password, 10) },
    });
    console.log(`[seed] ${data.role}: ${data.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
