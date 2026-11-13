// Выполняется перед каждым тестовым файлом (jest.setupFiles).
// Тесты работают с отдельной схемой PostgreSQL (TEST_DATABASE_URL) и без Redis (хранилища в памяти).
require('dotenv').config({ quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL не задан — скопируйте .env.example в .env');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
process.env.REDIS_URL = '';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
