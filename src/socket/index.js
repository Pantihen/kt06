const { Server } = require('socket.io');
const { chat } = require('../config');
const { socketAuth } = require('./auth');
const { createPresenceStore } = require('./presence');
const registerPresenceHandlers = require('./handlers/presence');
const registerChatHandlers = require('./handlers/chat');
const registerRoomHandlers = require('./handlers/rooms');

// Подключает Socket.io к существующему HTTP-серверу Express
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: chat.corsOrigin.length ? { origin: chat.corsOrigin, credentials: true } : undefined,
    maxHttpBufferSize: 10 * 1024, // как и лимит тела REST-запросов
  });

  const presence = createPresenceStore();

  io.use(socketAuth);

  io.on('connection', (socket) => {
    registerPresenceHandlers(io, socket, presence);
    registerChatHandlers(io, socket);
    registerRoomHandlers(io, socket);
  });

  return io;
}

module.exports = { initSocket };
