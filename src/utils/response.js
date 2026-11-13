// Единая структура успешных ответов:
//   { success: true, data }            — один объект
//   { success: true, data, meta }      — список с пагинацией
// Ошибки: { success: false, error: { code, message, details? } } — см. middleware/errorHandler.js

function send(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

const created = (res, data) => send(res, data, { status: 201 });
const noContent = (res) => res.status(204).end();

function paginationMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = { send, created, noContent, paginationMeta };
