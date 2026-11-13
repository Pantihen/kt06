const { app, prisma, request, resetDb } = require('./helpers');

const newUser = { email: 'ann@test.com', name: 'Ann', password: 'secret123' };

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /auth/register', () => {
  test('успешная регистрация: 201, пароль захэширован и не возвращается', async () => {
    const res = await request(app).post('/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ email: newUser.email, name: 'Ann', role: 'USER' });
    expect(res.body.data.password).toBeUndefined();

    const db = await prisma.user.findUnique({
      where: { email: newUser.email },
      omit: { password: false },
    });
    expect(db.password).not.toBe(newUser.password);
    expect(db.password).toMatch(/^\$2[aby]\$/); // формат bcrypt-хэша
  });

  test('дублирующийся email: 409 CONFLICT', async () => {
    const res = await request(app).post('/auth/register').send(newUser);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'CONFLICT' } });
  });

  test('невалидные данные: 400 с details по каждому полю', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'bad', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toEqual(
      expect.arrayContaining(['email', 'name', 'password'])
    );
  });

  test('роль из тела запроса игнорируется — всегда USER', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'hacker@test.com', name: 'H', password: 'secret123', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('USER');
  });
});

describe('POST /auth/login', () => {
  test('успешный логин: access token в ответе, refresh token в httpOnly cookie', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: newUser.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.password).toBeUndefined();

    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  test('неверный пароль: 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('несуществующий email: 401 с тем же сообщением', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody@test.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Неверный email или пароль');
  });
});

describe('refresh / logout', () => {
  const login = (agent) =>
    agent.post('/auth/login').send({ email: newUser.email, password: newUser.password });

  test('refresh по cookie выдаёт новый access token, без cookie — 401', async () => {
    const agent = request.agent(app); // хранит cookie между запросами
    await login(agent);

    const ok = await agent.post('/auth/refresh');
    expect(ok.status).toBe(200);
    expect(typeof ok.body.data.accessToken).toBe('string');

    const noCookie = await request(app).post('/auth/refresh');
    expect(noCookie.status).toBe(401);
  });

  test('ротация: использованный refresh token повторно не принимается', async () => {
    const agent = request.agent(app);
    const res = await login(agent);
    const oldCookie = res.headers['set-cookie'][0].split(';')[0];

    expect((await agent.post('/auth/refresh')).status).toBe(200);

    const reused = await request(app).post('/auth/refresh').set('Cookie', oldCookie);
    expect(reused.status).toBe(401);
  });

  test('logout отзывает refresh token и очищает cookie', async () => {
    const agent = request.agent(app);
    const res = await login(agent);
    const cookie = res.headers['set-cookie'][0].split(';')[0];

    const out = await agent.post('/auth/logout');
    expect(out.status).toBe(204);
    expect(out.headers['set-cookie'].join(';')).toMatch(/refreshToken=;/);

    // даже если сохранить cookie, после logout она недействительна
    const again = await request(app).post('/auth/refresh').set('Cookie', cookie);
    expect(again.status).toBe(401);
  });
});

describe('GET /auth/me (защищённый маршрут)', () => {
  test('с токеном: 200 и текущий пользователь', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: newUser.password });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(newUser.email);
    expect(res.body.data.password).toBeUndefined();
  });

  test('без токена: 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Требуется авторизация' },
    });
  });

  test('с поддельным токеном: 401', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});
