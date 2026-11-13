// Учёт онлайн-пользователей. Один пользователь может быть подключён
// с нескольких вкладок — он онлайн, пока открыто хотя бы одно соединение.
function createPresenceStore() {
  const online = new Map(); // userId -> { user, sockets: Set<socketId> }

  return {
    // true, если это первое соединение пользователя (он только что стал онлайн)
    add(user, socketId) {
      const entry = online.get(user.id) || { user, sockets: new Set() };
      entry.sockets.add(socketId);
      online.set(user.id, entry);
      return entry.sockets.size === 1;
    },

    // true, если закрылось последнее соединение (пользователь ушёл офлайн)
    remove(userId, socketId) {
      const entry = online.get(userId);
      if (!entry) return false;
      entry.sockets.delete(socketId);
      if (entry.sockets.size > 0) return false;
      online.delete(userId);
      return true;
    },

    list() {
      return [...online.values()].map(({ user }) => publicUser(user));
    },
  };
}

function publicUser({ id, name, role }) {
  return { id, name, role };
}

module.exports = { createPresenceStore, publicUser };
