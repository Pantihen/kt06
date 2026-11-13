const { app, prisma, request, resetDb } = require('./helpers');

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('безопасность и инфраструктура', () => {
  test('helmet: заголовки X-Frame-Options и X-Content-Type-Options', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('GET /health: база доступна', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok', db: 'up', redis: 'disabled' });
  });

  test('тело запроса больше 10kb: 413', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'big@test.com', name: 'x'.repeat(11 * 1024), password: 'secret123' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('некорректный JSON: 400 INVALID_JSON', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('несуществующий маршрут: 404 в едином формате', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Маршрут GET /api/unknown не найден' },
    });
  });

  test('rate limit на /auth/login: 11-й запрос за 15 минут — 429', async () => {
    const creds = { email: 'nobody@test.com', password: 'wrong' };
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).post('/auth/login').send(creds)).status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send(creds);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers.ratelimit).toBeDefined();
  });
});
