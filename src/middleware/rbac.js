const { forbidden, notFound } = require('../utils/errors');

// Роли и их права:
//   USER      — читает всё, создаёт посты и комментарии, меняет/удаляет только свои
//   MODERATOR — как USER + меняет/удаляет любые посты и комментарии, видит список пользователей
//   ADMIN     — всё, включая управление пользователями и смену ролей
const ROLES = Object.freeze({ USER: 'USER', MODERATOR: 'MODERATOR', ADMIN: 'ADMIN' });
const STAFF = [ROLES.MODERATOR, ROLES.ADMIN];

// Пропускает только перечисленные роли. Используется после authenticate.
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

// Проверка владельца: владелец ресурса или одна из привилегированных ролей.
// getOwnerId(req) возвращает id владельца или null, если ресурса нет (-> 404).
function authorizeOwnerOr(getOwnerId, ...privilegedRoles) {
  return async (req, res, next) => {
    const ownerId = await getOwnerId(req);
    if (ownerId === null || ownerId === undefined) throw notFound();
    if (ownerId !== req.user.id && !privilegedRoles.includes(req.user.role)) throw forbidden();
    next();
  };
}

module.exports = { ROLES, STAFF, authorize, authorizeOwnerOr };
