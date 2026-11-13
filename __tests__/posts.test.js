const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');

let ann;
let bob;

beforeAll(async () => {
  await resetDb();
  ann = await createUserAndLogin('USER');
  bob = await createUserAndLogin('USER');
});

afterAll(() => prisma.$disconnect());

describe('CRUD постов с аутентификацией', () => {
  let postId;

  test('POST /api/posts без токена — 401', async () => {
    const res = await request(app).post('/api/posts').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  test('POST /api/posts: 201, автор из токена, теги через connectOrCreate', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(auth(ann.token))
      .send({ title: 'Привет, Prisma', content: 'Текст', published: true, tags: ['NodeJS', 'prisma'], authorId: bob.user.id });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      title: 'Привет, Prisma',
      published: true,
      authorId: ann.user.id,
      author: { id: ann.user.id, name: ann.user.name },
      _count: { comments: 0 },
    });
    expect(res.body.data.tags.map((t) => t.name).sort()).toEqual(['nodejs', 'prisma']);
    postId = res.body.data.id;
  });

  test('существующий тег переиспользуется, а не создаётся заново', async () => {
    await request(app).post('/api/posts').set(auth(bob.token)).send({ title: 'Второй', tags: ['nodejs'] });
    expect(await prisma.tag.count({ where: { name: 'nodejs' } })).toBe(1);
  });

  test('POST /api/posts без title — 400', async () => {
    const res = await request(app).post('/api/posts').set(auth(ann.token)).send({ content: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('title');
  });

  test('GET /api/posts/:id: пост с автором, тегами и комментариями', async () => {
    const res = await request(app).get(`/api/posts/${postId}`).set(auth(bob.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: postId, author: { id: ann.user.id }, comments: [] });
  });

  test('GET /api/posts/:id несуществующий — 404, нечисловой id — 400', async () => {
    expect((await request(app).get('/api/posts/999999').set(auth(ann.token))).status).toBe(404);
    expect((await request(app).get('/api/posts/abc').set(auth(ann.token))).status).toBe(400);
  });

  test('PATCH /api/posts/:id владельцем: 200, tags заменяются целиком', async () => {
    const res = await request(app)
      .patch(`/api/posts/${postId}`)
      .set(auth(ann.token))
      .send({ title: 'Обновлён', tags: ['express'] });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Обновлён');
    expect(res.body.data.tags.map((t) => t.name)).toEqual(['express']);
  });

  test('PATCH с пустым телом — 400', async () => {
    const res = await request(app).patch(`/api/posts/${postId}`).set(auth(ann.token)).send({});
    expect(res.status).toBe(400);
  });

  test('DELETE /api/posts/:id владельцем: 204, повторно — 404', async () => {
    expect((await request(app).delete(`/api/posts/${postId}`).set(auth(ann.token))).status).toBe(204);
    expect((await request(app).delete(`/api/posts/${postId}`).set(auth(ann.token))).status).toBe(404);
  });
});

describe('GET /api/posts: фильтрация и пагинация', () => {
  beforeAll(async () => {
    await prisma.post.deleteMany();
    const make = (token, body) => request(app).post('/api/posts').set(auth(token)).send(body);
    await make(ann.token, { title: 'Первый пост про Node', published: true, tags: ['node'] });
    await make(ann.token, { title: 'Черновик', published: false });
    await make(bob.token, { title: 'Пост Боба про ПРИВЕТ', published: true, tags: ['node', 'bob'] });
  });

  const titles = (res) => res.body.data.map((p) => p.title).sort();
  const get = (query) => request(app).get(`/api/posts?${query}`).set(auth(ann.token));

  test('search ищет по заголовку без учёта регистра (в т.ч. кириллица)', async () => {
    expect(titles(await get('search=NODE'))).toEqual(['Первый пост про Node']);
    expect(titles(await get('search=привет'))).toEqual(['Пост Боба про ПРИВЕТ']);
  });

  test('published, authorId и tag фильтруют и комбинируются', async () => {
    expect(titles(await get('published=false'))).toEqual(['Черновик']);
    expect(titles(await get(`authorId=${bob.user.id}`))).toEqual(['Пост Боба про ПРИВЕТ']);
    expect(titles(await get('tag=node'))).toHaveLength(2);
    expect(titles(await get(`tag=node&authorId=${ann.user.id}`))).toEqual(['Первый пост про Node']);
  });

  test('пагинация: meta содержит total, page, limit, pages', async () => {
    const res = await get('page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 3, page: 2, limit: 2, pages: 2 });
  });

  test('невалидные параметры — 400', async () => {
    const res = await get('page=0&published=maybe');
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['page', 'published']);
  });
});
