const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');

let ann;
let bob;
let moderator;
let postId;

const addComment = (token, content, id = postId) =>
  request(app).post(`/api/posts/${id}/comments`).set(auth(token)).send({ content });

beforeAll(async () => {
  await resetDb();
  ann = await createUserAndLogin('USER');
  bob = await createUserAndLogin('USER');
  moderator = await createUserAndLogin('MODERATOR');
  const post = await request(app).post('/api/posts').set(auth(ann.token)).send({ title: 'Пост' });
  postId = post.body.data.id;
});

afterAll(() => prisma.$disconnect());

describe('CRUD комментариев', () => {
  test('POST /api/posts/:postId/comments: 201, автор из токена', async () => {
    const res = await addComment(bob.token, '  Отличный пост!  ');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      content: 'Отличный пост!',
      postId,
      authorId: bob.user.id,
      author: { id: bob.user.id },
    });
  });

  test('к несуществующему посту — 404, пустой текст — 400, без токена — 401', async () => {
    expect((await addComment(bob.token, 'x', 999999)).status).toBe(404);
    expect((await addComment(bob.token, '   ')).status).toBe(400);
    expect((await request(app).post(`/api/posts/${postId}/comments`).send({ content: 'x' })).status).toBe(401);
  });

  test('GET /api/posts/:postId/comments: пагинация и фильтр authorId', async () => {
    await addComment(ann.token, 'Спасибо!');
    await addComment(bob.token, 'Ещё вопрос');

    const all = await request(app).get(`/api/posts/${postId}/comments?limit=2`).set(auth(ann.token));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toEqual({ total: 3, page: 1, limit: 2, pages: 2 });

    const byBob = await request(app)
      .get(`/api/posts/${postId}/comments?authorId=${bob.user.id}`)
      .set(auth(ann.token));
    expect(byBob.body.data.every((c) => c.authorId === bob.user.id)).toBe(true);
    expect(byBob.body.meta.total).toBe(2);
  });

  test('GET /api/comments/:id: 200 и 404', async () => {
    const { body } = await addComment(bob.token, 'Найди меня');
    expect((await request(app).get(`/api/comments/${body.data.id}`).set(auth(ann.token))).body.data.content).toBe(
      'Найди меня'
    );
    expect((await request(app).get('/api/comments/999999').set(auth(ann.token))).status).toBe(404);
  });

  test('количество комментариев видно в посте', async () => {
    const res = await request(app).get(`/api/posts/${postId}`).set(auth(ann.token));
    expect(res.body.data._count.comments).toBe(4);
    expect(res.body.data.comments).toHaveLength(4);
  });
});

describe('комментарии: проверка владельца', () => {
  test('автор редактирует свой комментарий: 200; другой USER — 403', async () => {
    const { body } = await addComment(bob.token, 'Оригинал');
    const url = `/api/comments/${body.data.id}`;

    const denied = await request(app).patch(url).set(auth(ann.token)).send({ content: 'Взлом' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const ok = await request(app).patch(url).set(auth(bob.token)).send({ content: 'Исправлено' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.content).toBe('Исправлено');
  });

  test('другой USER не может удалить чужой комментарий, MODERATOR — может', async () => {
    const { body } = await addComment(bob.token, 'Спам');
    const url = `/api/comments/${body.data.id}`;

    expect((await request(app).delete(url).set(auth(ann.token))).status).toBe(403);
    expect((await request(app).delete(url).set(auth(moderator.token))).status).toBe(204);
    expect(await prisma.comment.findUnique({ where: { id: body.data.id } })).toBeNull();
  });

  test('удаление поста каскадно удаляет его комментарии', async () => {
    const post = await request(app).post('/api/posts').set(auth(ann.token)).send({ title: 'Временный' });
    const id = post.body.data.id;
    await addComment(bob.token, 'Исчезну вместе с постом', id);

    expect((await request(app).delete(`/api/posts/${id}`).set(auth(ann.token))).status).toBe(204);
    expect(await prisma.comment.count({ where: { postId: id } })).toBe(0);
  });
});
