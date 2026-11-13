const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config');
const { hashPassword } = require('../src/utils/password');

const PASSWORD = 'secret123';

// Полная очистка тестовой схемы с обнулением автоинкрементов
async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "Comment", "_PostToTag", "Post", "Tag", "User" RESTART IDENTITY CASCADE'
  );
}

let counter = 0;

// Создаёт пользователя напрямую в БД и логинится — возвращает { user, token }
async function createUserAndLogin(role = 'USER') {
  counter += 1;
  const email = `${role.toLowerCase()}${counter}@test.com`;
  const user = await prisma.user.create({
    data: { email, name: `${role} ${counter}`, role, password: await hashPassword(PASSWORD) },
  });
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return { user, token: res.body.data.accessToken };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { app, prisma, request, resetDb, createUserAndLogin, auth, PASSWORD };
