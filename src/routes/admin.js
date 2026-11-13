const express = require('express');
const { prisma } = require('../config');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/rbac');
const { send } = require('../utils/response');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

// PATCH /admin/users/:id/role — сменить роль пользователя (только ADMIN)
router.patch(
  '/users/:id/role',
  validate(schemas.idParam, 'params'),
  validate(schemas.roleUpdate),
  async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.validated.params.id },
      data: { role: req.validated.body.role },
    });
    send(res, user);
  }
);

module.exports = router;
