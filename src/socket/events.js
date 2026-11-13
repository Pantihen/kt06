// Имена всех событий в одном месте
module.exports = {
  // клиент -> сервер
  MESSAGE_SEND: 'message:send',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_MESSAGE: 'room:message', // и сервер -> участники комнаты

  // сервер -> клиент
  MESSAGE_NEW: 'message:new',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  USERS_ONLINE: 'users:online', // список онлайн-пользователей при подключении
  ROOM_USER_JOINED: 'room:user-joined',
  ROOM_USER_LEFT: 'room:user-left',
};
