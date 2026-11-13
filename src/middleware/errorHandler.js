const { Prisma } = require('@prisma/client');
const { isProduction } = require('../config');
const { AppError } = require('../utils/errors');

// 404 для несуществующих маршрутов
function notFoundRoute(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Маршрут ${req.method} ${req.originalUrl} не найден`));
}

// Перевод известных ошибок (Prisma, body-parser) в AppError
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = [].concat(err.meta?.target || 'unique').join(', ');
        return new AppError(409, 'CONFLICT', `Значение поля ${fields} уже занято`);
      }
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', 'Запись не найдена');
      case 'P2003':
        return new AppError(400, 'VALIDATION_ERROR', 'Связанная запись не существует');
      default:
        break;
    }
  }

  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Некорректный JSON в теле запроса');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Тело запроса слишком большое (максимум 10kb)');
  }

  return null;
}

// Перехватывает все необработанные ошибки (в т.ч. из async-обработчиков — Express 5)
// и отвечает в едином формате: { success: false, error: { code, message, details? } }.
// В production stack trace и текст внутренних ошибок клиенту не отдаются.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = normalize(err);
  const status = known?.status || 500;

  if (status >= 500) console.error(err);

  const error = {
    code: known?.code || 'INTERNAL_ERROR',
    message: known ? known.message : isProduction ? 'Внутренняя ошибка сервера' : err.message,
  };
  if (known?.details) error.details = known.details;
  if (!isProduction && status >= 500) error.stack = err.stack;

  res.status(status).json({ success: false, error });
}

module.exports = { notFoundRoute, errorHandler };
