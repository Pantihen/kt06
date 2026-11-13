const EVENTS = require('../events');
const { publicUser } = require('../presence');
const { validatePayload, schemas } = require('../../middleware/validate');
const { createMessage, getRecentMessages } = require('../../services/messages');
const { ok, fail, validationFailed, withErrors } = require('./utils');

// Префикс, чтобы имена комнат не пересекались с id сокетов
const PREFIX = 'room:';
const channel = (room) => `${PREFIX}${room}`;

module.exports = function registerRoomHandlers(io, socket) {
  const { user } = socket.data;
  const isMember = (room) => socket.rooms.has(channel(room));

  // room:join { room } -> ack с историей последних сообщений из БД
  socket.on(
    EVENTS.ROOM_JOIN,
    withErrors(async (payload, reply) => {
      const { value, error } = validatePayload(schemas.roomJoin, payload);
      if (error) return reply(validationFailed(error));

      const { room } = value;
      if (!isMember(room)) {
        await socket.join(channel(room));
        socket.to(channel(room)).emit(EVENTS.ROOM_USER_JOINED, { room, user: publicUser(user) });
      }
      reply(ok({ room, history: await getRecentMessages(room) }));
    })
  );

  // room:leave { room }
  socket.on(
    EVENTS.ROOM_LEAVE,
    withErrors(async (payload, reply) => {
      const { value, error } = validatePayload(schemas.roomJoin, payload);
      if (error) return reply(validationFailed(error));

      const { room } = value;
      if (!isMember(room)) return reply(fail('NOT_A_MEMBER', `Вы не состоите в комнате ${room}`));

      await socket.leave(channel(room));
      socket.to(channel(room)).emit(EVENTS.ROOM_USER_LEFT, { room, user: publicUser(user) });
      reply(ok({ room }));
    })
  );

  // room:message { room, content } -> участникам комнаты room:message
  socket.on(
    EVENTS.ROOM_MESSAGE,
    withErrors(async (payload, reply) => {
      const { value, error } = validatePayload(schemas.roomMessage, payload);
      if (error) return reply(validationFailed(error));

      const { room, content } = value;
      if (!isMember(room)) {
        return reply(fail('NOT_A_MEMBER', `Сначала войдите в комнату ${room} (room:join)`));
      }

      const message = await createMessage({ authorId: user.id, content, room });
      io.to(channel(room)).emit(EVENTS.ROOM_MESSAGE, message);
      reply(ok(message));
    })
  );

  // При отключении сообщаем комнатам, что пользователь вышел
  socket.on('disconnecting', () => {
    for (const name of socket.rooms) {
      if (name.startsWith(PREFIX)) {
        const room = name.slice(PREFIX.length);
        socket.to(name).emit(EVENTS.ROOM_USER_LEFT, { room, user: publicUser(user) });
      }
    }
  });
};
