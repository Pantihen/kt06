const EVENTS = require('../events');
const { publicUser } = require('../presence');

module.exports = function registerPresenceHandlers(io, socket, presence) {
  const { user } = socket.data;

  const cameOnline = presence.add(user, socket.id);

  // Новому пользователю — список всех, кто онлайн (включая его самого)
  socket.emit(EVENTS.USERS_ONLINE, presence.list());

  // Остальным — уведомление, но только при первом соединении пользователя
  if (cameOnline) {
    socket.broadcast.emit(EVENTS.USER_ONLINE, publicUser(user));
  }

  socket.on('disconnect', () => {
    if (presence.remove(user.id, socket.id)) {
      socket.broadcast.emit(EVENTS.USER_OFFLINE, publicUser(user));
    }
  });
};
