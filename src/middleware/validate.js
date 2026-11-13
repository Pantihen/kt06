const Joi = require('joi');
const { pagination, chat } = require('../config');
const { ROLES } = require('./rbac');
const { badRequest } = require('../utils/errors');

const roleValues = Object.values(ROLES);

const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(pagination.maxLimit).default(pagination.defaultLimit),
};

const id = Joi.number().integer().min(1);
const email = Joi.string().trim().lowercase().email();
const name = Joi.string().trim().min(1).max(100);
// bcrypt учитывает только первые 72 байта пароля
const password = Joi.string().min(6).max(72);
const title = Joi.string().trim().min(1).max(200);
const postContent = Joi.string().max(20000).allow('', null);
const tags = Joi.array().items(Joi.string().trim().lowercase().min(1).max(50)).max(10).unique();
const commentContent = Joi.string().trim().min(1).max(2000);
const roomName = Joi.string()
  .trim()
  .min(1)
  .max(chat.maxRoomNameLength)
  .pattern(/^[\p{L}\p{N}_-]+$/u)
  .messages({ 'string.pattern.base': 'room может содержать только буквы, цифры, _ и -' });
const messageContent = Joi.string().trim().min(1).max(chat.maxMessageLength);

const schemas = {
  idParam: Joi.object({ id: id.required() }),
  postIdParam: Joi.object({ postId: id.required() }),

  // ---------- auth ----------
  register: Joi.object({
    email: email.required(),
    name: name.required(),
    password: password.required(),
  }),
  login: Joi.object({
    email: email.required(),
    password: Joi.string().required(),
  }),

  // ---------- users ----------
  userQuery: Joi.object({
    role: Joi.string().valid(...roleValues),
    search: Joi.string().trim().min(1),
    ...paginationFields,
  }),
  userCreate: Joi.object({
    email: email.required(),
    name: name.required(),
    password: password.required(),
    role: Joi.string().valid(...roleValues),
  }),
  userUpdate: Joi.object({ email, name, password }).min(1),
  roleUpdate: Joi.object({
    role: Joi.string().valid(...roleValues).required(),
  }),

  // ---------- posts ----------
  postQuery: Joi.object({
    search: Joi.string().trim().min(1),
    published: Joi.boolean(),
    authorId: id,
    tag: Joi.string().trim().lowercase().min(1),
    ...paginationFields,
  }),
  // authorId берётся из токена (req.user.id), а не из тела запроса
  postCreate: Joi.object({
    title: title.required(),
    content: postContent,
    published: Joi.boolean(),
    tags,
  }),
  postUpdate: Joi.object({
    title,
    content: postContent,
    published: Joi.boolean(),
    tags,
  }).min(1),

  // ---------- comments ----------
  commentQuery: Joi.object({
    authorId: id,
    ...paginationFields,
  }),
  commentCreate: Joi.object({ content: commentContent.required() }),
  commentUpdate: Joi.object({ content: commentContent.required() }),

  // ---------- chat (Socket.io и REST) ----------
  chatMessage: Joi.object({ content: messageContent.required() }),
  roomJoin: Joi.object({ room: roomName.required() }),
  roomMessage: Joi.object({ room: roomName.required(), content: messageContent.required() }),
  messageQuery: Joi.object({ room: roomName, ...paginationFields }),
};

const joiOptions = { abortEarly: false, stripUnknown: true, convert: true };

function formatDetails(error, fallbackField) {
  return error.details.map((d) => ({
    field: d.path.join('.') || fallbackField,
    message: d.message.replace(/"/g, ''),
  }));
}

// Проверка данных вне Express (например, payload событий Socket.io)
function validatePayload(schema, data) {
  const { error, value } = schema.validate(data ?? {}, joiOptions);
  return error ? { error: formatDetails(error, 'payload') } : { value };
}

// Фабрика middleware: source — 'body' | 'query' | 'params'.
// При ошибке — 400 { success: false, error: { code: 'VALIDATION_ERROR', details: [...] } }
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source] ?? {}, joiOptions);
    if (error) {
      throw badRequest('Ошибка валидации', formatDetails(error, source));
    }
    // В Express 5 req.query только для чтения, поэтому очищенные данные кладём отдельно
    req.validated = { ...(req.validated || {}), [source]: value };
    next();
  };
}

module.exports = { validate, validatePayload, schemas };
