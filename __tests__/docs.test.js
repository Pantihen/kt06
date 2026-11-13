const { app, prisma, request } = require('./helpers');
const spec = require('../src/config/swagger');

afterAll(() => prisma.$disconnect());

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((method) => ({ path, method, op: item[method] }))
);

describe('Swagger-документация', () => {
  test('Swagger UI доступен по /api/docs, JSON-спецификация по /api/docs.json', async () => {
    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toMatch(/swagger-ui/i);

    const json = await request(app).get('/api/docs.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toMatch(/^3\./);
  });

  test('описаны все маршруты API (23 операции)', () => {
    expect(operations).toHaveLength(23);
  });

  test('каждая операция описана: summary, ответы, параметры пути', () => {
    for (const { path, method, op } of operations) {
      expect([path, method, op.summary]).toEqual([path, method, expect.any(String)]);
      expect(Object.keys(op.responses).length).toBeGreaterThan(0);

      const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const declared = [...(spec.paths[path].parameters || []), ...(op.parameters || [])].map(
        (p) => p.name || p.$ref.split('/').pop()
      );
      for (const name of pathParams) expect(declared).toContain(name);
    }
  });

  test('каждый задокументированный маршрут реально существует в приложении', async () => {
    for (const { path, method } of operations) {
      const url = path.replace(/\{\w+\}/g, '1');
      const res = await request(app)[method](url);
      expect([`${method.toUpperCase()} ${path}`, res.body?.error?.code]).not.toEqual([
        `${method.toUpperCase()} ${path}`,
        'ROUTE_NOT_FOUND',
      ]);
    }
  });

  test('схемы моделей и DTO описаны в components/schemas, все $ref разрешаются', () => {
    const { schemas } = spec.components;
    for (const name of ['User', 'Post', 'Tag', 'Comment', 'Message', 'CreatePostDto', 'UpdatePostDto', 'CreateCommentDto', 'Error', 'PaginationMeta']) {
      expect(schemas).toHaveProperty(name);
    }

    const refs = JSON.stringify(spec).match(/#\/components\/[\w/]+/g);
    for (const r of refs) {
      const [, , section, name] = r.split('/');
      expect([r, Boolean(spec.components[section]?.[name])]).toEqual([r, true]);
    }
  });
});
