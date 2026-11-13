function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

// Загружает errorHandler с нужным NODE_ENV в изолированном реестре модулей.
// AppError берётся из того же реестра, иначе instanceof не совпадёт.
function loadModules(nodeEnv) {
  let modules;
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  jest.isolateModules(() => {
    modules = {
      errorHandler: require('../../src/middleware/errorHandler').errorHandler,
      AppError: require('../../src/utils/errors').AppError,
    };
  });
  process.env.NODE_ENV = prev;
  return modules;
}

const loadErrorHandler = (nodeEnv) => loadModules(nodeEnv).errorHandler;

describe('middleware/errorHandler (unit)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('в production stack trace и текст внутренней ошибки скрыты', () => {
    const res = mockRes();
    loadErrorHandler('production')(new Error('DB password leaked'), {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' },
    });
  });

  test('в development stack trace отдаётся для отладки', () => {
    const res = mockRes();
    loadErrorHandler('development')(new Error('boom'), {}, res, () => {});

    const { error } = res.json.mock.calls[0][0];
    expect(error.message).toBe('boom');
    expect(error.stack).toMatch(/Error: boom/);
  });

  test('AppError превращается в ответ с её статусом, кодом и details', () => {
    const res = mockRes();
    const details = [{ field: 'title', message: 'title is required' }];
    const { errorHandler, AppError } = loadModules('production');
    errorHandler(new AppError(400, 'VALIDATION_ERROR', 'Ошибка валидации', details), {}, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Ошибка валидации', details },
    });
  });
});
