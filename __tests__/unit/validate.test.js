const { validate, validatePayload, schemas } = require('../../src/middleware/validate');
const { AppError } = require('../../src/utils/errors');

function run(schema, body) {
  const req = { body };
  const next = jest.fn();
  let error;
  try {
    validate(schema)(req, {}, next);
  } catch (err) {
    error = err;
  }
  return { req, next, error };
}

describe('middleware/validate (unit)', () => {
  test('валидные данные: next(), данные очищены и нормализованы', () => {
    const { req, next, error } = run(schemas.register, {
      email: '  Ann@Test.COM ',
      name: 'Ann',
      password: 'secret123',
      role: 'ADMIN', // лишнее поле вырезается
    });
    expect(error).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(req.validated.body).toEqual({ email: 'ann@test.com', name: 'Ann', password: 'secret123' });
  });

  test('невалидные данные: AppError 400 VALIDATION_ERROR с details по всем полям', () => {
    const { next, error } = run(schemas.postCreate, { title: '', tags: 'not-array' });
    expect(next).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(error.details.map((d) => d.field)).toEqual(['title', 'tags']);
  });

  test('validatePayload для событий Socket.io: имя комнаты проверяется по шаблону', () => {
    expect(validatePayload(schemas.roomJoin, { room: 'nodejs' })).toEqual({ value: { room: 'nodejs' } });
    expect(validatePayload(schemas.roomJoin, { room: 'bad room!' }).error[0].field).toBe('room');
  });
});
