const express = require('express');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { listMessages } = require('../services/messages');
const { send } = require('../utils/response');

const router = express.Router();

router.use(authenticate);

// GET /api/messages?room=&page=&limit= — история чата (без room — общий чат)
router.get('/', validate(schemas.messageQuery, 'query'), async (req, res) => {
  const { data, meta } = await listMessages(req.validated.query);
  send(res, data, { meta });
});

module.exports = router;
