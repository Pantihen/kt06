const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');

let owner;
let other;
let moderator;
let admin;

async function createPost(token, title = 'My post') {
  const res = await request(app).post('/api/posts').set(auth(token)).send({ title });
  return res.body.data;
}

beforeAll(async () => {
  await resetDb();
  owner = await createUserAndLogin('USER');
  other = await createUserAndLogin('USER');
  moderator = await createUserAndLogin('MODERATOR');
  admin = await createUserAndLogin('ADMIN');
});

afterAll(() => prisma.$disconnect());

describe('посты: проверка владельца', () => {
  test('владелец удаляет свой пост: 204', async () => {
    const post = await createPost(owner.token);
    const res = await request(app).delete(`/api/posts/${post.id}`).set(auth(owner.token));
    expect(res.status).toBe(204);
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
  });

  test('другой USER не может удалить чужой пост: 403', async () => {
    const post = await createPost(owner.token);
    const res = await request(app).delete(`/api/posts/${post.id}`).set(auth(other.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.post.findUnique({ where: { id: post.id } })).not.toBeNull();
  });

  test('другой USER не может редактировать чужой пост: 403', async () => {
    const post = await createPost(owner.token);
    const res = await request(app).patch(`/api/posts/${post.id}`).set(auth(other.token)).send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });

  test('MODERATOR и ADMIN редактируют и удаляют любые посты', async () => {
    const p1 = await createPost(owner.token);
    expect(
      (await request(app).patch(`/api/posts/${p1.id}`).set(auth(moderator.token)).send({ published: true })).status
    ).toBe(200);
    expect((await request(app).delete(`/api/posts/${p1.id}`).set(auth(moderator.token))).status).toBe(204);

    const p2 = await createPost(owner.token);
    expect((await request(app).delete(`/api/posts/${p2.id}`).set(auth(admin.token))).status).toBe(204);
  });
});

describe('пользователи: роли', () => {
  test('GET /api/users: USER — 403, MODERATOR и ADMIN — 200 с фильтром по роли', async () => {
    expect((await request(app).get('/api/users').set(auth(owner.token))).status).toBe(403);

    const res = await request(app).get('/api/users?role=USER').set(auth(moderator.token));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((u) => u.role === 'USER' && u.password === undefined)).toBe(true);

    expect((await request(app).get('/api/users').set(auth(admin.token))).status).toBe(200);
  });

  test('POST /api/users: только ADMIN', async () => {
    const body = { email: 'new@test.com', name: 'New', password: 'secret123', role: 'MODERATOR' };
    expect((await request(app).post('/api/users').set(auth(moderator.token)).send(body)).status).toBe(403);

    const res = await request(app).post('/api/users').set(auth(admin.token)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('MODERATOR');
  });

  test('PATCH /api/users/:id: свой профиль — 200, чужой — 403, ADMIN — любой', async () => {
    expect(
      (await request(app).patch(`/api/users/${owner.user.id}`).set(auth(owner.token)).send({ name: 'Me' })).status
    ).toBe(200);
    expect(
      (await request(app).patch(`/api/users/${owner.user.id}`).set(auth(other.token)).send({ name: 'X' })).status
    ).toBe(403);
    expect(
      (await request(app).patch(`/api/users/${owner.user.id}`).set(auth(admin.token)).send({ name: 'A' })).status
    ).toBe(200);
  });

  test('PATCH /admin/users/:id/role: только ADMIN, новая роль действует сразу', async () => {
    const url = `/admin/users/${other.user.id}/role`;
    expect((await request(app).patch(url).set(auth(other.token)).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await request(app).patch(url).set(auth(moderator.token)).send({ role: 'ADMIN' })).status).toBe(403);

    const res = await request(app).patch(url).set(auth(admin.token)).send({ role: 'MODERATOR' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('MODERATOR');

    // роль берётся из БД при каждом запросе, а не из старого токена
    expect((await request(app).get('/api/users').set(auth(other.token))).status).toBe(200);
  });

  test('DELETE /api/users/:id: чужой — 403, свой — 204 (посты удаляются каскадно)', async () => {
    const victim = await createUserAndLogin('USER');
    await createPost(victim.token, 'Мой пост');

    expect((await request(app).delete(`/api/users/${victim.user.id}`).set(auth(owner.token))).status).toBe(403);
    expect((await request(app).delete(`/api/users/${victim.user.id}`).set(auth(victim.token))).status).toBe(204);
    expect(await prisma.post.count({ where: { authorId: victim.user.id } })).toBe(0);
  });
});
