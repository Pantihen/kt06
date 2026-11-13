// Ошибка приложения с HTTP-статусом и машиночитаемым кодом.
// Все такие ошибки превращает в единый JSON-ответ errorHandler.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
const unauthorized = (message = 'Требуется авторизация') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Недостаточно прав') => new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Запись не найдена') => new AppError(404, 'NOT_FOUND', message);
const conflict = (message) => new AppError(409, 'CONFLICT', message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
