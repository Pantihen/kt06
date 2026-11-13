const EVENTS = require('../events');
const { validatePayload, schemas } = require('../../middleware/validate');
const { createMessage } = require('../../services/messages');
const { ok, validationFailed, withErrors } = require('./utils');

module.exports = function registerChatHandlers(io, socket) {
  const { user } = socket.data;

  // message:send { content } -> всем message:new (сообщение сохраняется в БД)
  socket.on(
    EVENTS.MESSAGE_SEND,
    withErrors(async (payload, reply) => {
      const { value, error } = validatePayload(schemas.chatMessage, payload);
      if (error) return reply(validationFailed(error));

      const message = await createMessage({ authorId: user.id, content: value.content });
      io.emit(EVENTS.MESSAGE_NEW, message);
      reply(ok(message));
    })
  );
};
