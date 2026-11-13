// Ответы на события Socket.io в том же формате, что и REST:
//   { success: true, data }  /  { success: false, error: { code, message, details? } }
const ackOf = (ack) => (typeof ack === 'function' ? ack : () => {});

const ok = (data) => ({ success: true, data });

function fail(code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  return { success: false, error };
}

const validationFailed = (details) => fail('VALIDATION_ERROR', 'Ошибка валидации', details);

// Ошибки обработчиков не роняют сервер: логируем и отвечаем через ack
function withErrors(handler) {
  return async (payload, ack) => {
    try {
      await handler(payload, ackOf(ack));
    } catch (err) {
      console.error(err);
      ackOf(ack)(fail('INTERNAL_ERROR', 'Внутренняя ошибка сервера'));
    }
  };
}

module.exports = { ok, fail, validationFailed, withErrors };
