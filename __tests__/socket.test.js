const http = require('http');
const { io: ioClient } = require('socket.io-client');
const { app, prisma, request, resetDb, createUserAndLogin } = require('./helpers');
const { initSocket } = require('../src/socket');
const EVENTS = require('../src/socket/events');

let httpServer;
let io;
let url;
let ann;
let bob;
let eve;
const clients = [];

// Клиент записывает все входящие события, чтобы не пропустить ранние (users:online)
function connect(token, { auth = { token } } = {}) {
  const socket = ioClient(url, {
    auth: token === undefined ? {} : auth,
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    forceNew: true,
  });
  socket.received = [];
  socket.onAny((event, ...args) => socket.received.push({ event, payload: args[0] }));
  clients.push(socket);

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
    socket.connect();
  });
}

function waitFor(socket, event, match = () => true, timeout = 2000) {
  const seen = socket.received.find((r) => r.event === event && match(r.payload));
  if (seen) return Promise.resolve(seen.payload);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.offAny(handler);
      reject(new Error(`Событие ${event} не пришло`));
    }, timeout);
    function handler(ev, payload) {
      if (ev === event && match(payload)) {
        clearTimeout(timer);
        socket.offAny(handler);
        resolve(payload);
      }
    }
    socket.onAny(handler);
  });
}

const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const got = (socket, event) => socket.received.filter((r) => r.event === event).map((r) => r.payload);

beforeAll(async () => {
  await resetDb();
  ann = await createUserAndLogin('USER');
  bob = await createUserAndLogin('USER');
  eve = await createUserAndLogin('MODERATOR');

  httpServer = http.createServer(app);
  io = initSocket(httpServer);
  await new Promise((r) => httpServer.listen(0, r));
  url = `http://localhost:${httpServer.address().port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  await pause(50);
});

afterAll(async () => {
  io.close();
  await prisma.$disconnect();
});

describe('Socket.io: аутентификация', () => {
  test('без токена подключение отклоняется', async () => {
    await expect(connect(undefined)).rejects.toThrow('Требуется авторизация');
  });

  test('с поддельным токеном подключение отклоняется', async () => {
    await expect(connect('abc.def.ghi')).rejects.toThrow('Недействительный или просроченный токен');
  });

  test('с валидным access token подключение проходит', async () => {
    const socket = await connect(ann.token);
    expect(socket.connected).toBe(true);
  });
});

describe('Socket.io: онлайн-статус', () => {
  test('новый пользователь получает список онлайн-пользователей', async () => {
    await connect(ann.token);
    const bobSocket = await connect(bob.token);

    const list = await waitFor(bobSocket, EVENTS.USERS_ONLINE);
    expect(list.map((u) => u.id).sort()).toEqual([ann.user.id, bob.user.id].sort());
    expect(list[0]).not.toHaveProperty('email');
  });

  test('остальные получают user:online при подключении и user:offline при отключении', async () => {
    const annSocket = await connect(ann.token);
    const bobSocket = await connect(bob.token);

    const online = await waitFor(annSocket, EVENTS.USER_ONLINE, (u) => u.id === bob.user.id);
    expect(online).toEqual({ id: bob.user.id, name: bob.user.name, role: 'USER' });

    bobSocket.disconnect();
    const offline = await waitFor(annSocket, EVENTS.USER_OFFLINE, (u) => u.id === bob.user.id);
    expect(offline.id).toBe(bob.user.id);
  });

  test('несколько вкладок: offline только после закрытия последнего соединения', async () => {
    const annSocket = await connect(ann.token);
    const tab1 = await connect(bob.token);
    const tab2 = await connect(bob.token);
    await pause();
    expect(got(annSocket, EVENTS.USER_ONLINE).filter((u) => u.id === bob.user.id)).toHaveLength(1);

    tab1.disconnect();
    await pause();
    expect(got(annSocket, EVENTS.USER_OFFLINE)).toHaveLength(0);

    tab2.disconnect();
    await waitFor(annSocket, EVENTS.USER_OFFLINE, (u) => u.id === bob.user.id);
  });
});

describe('Socket.io: общий чат', () => {
  test('message:send -> все получают message:new, сообщение сохранено в БД', async () => {
    const annSocket = await connect(ann.token);
    const bobSocket = await connect(bob.token);

    const ack = await annSocket.emitWithAck(EVENTS.MESSAGE_SEND, { content: '  Привет всем!  ' });
    expect(ack.success).toBe(true);

    for (const s of [annSocket, bobSocket]) {
      const msg = await waitFor(s, EVENTS.MESSAGE_NEW);
      expect(msg).toMatchObject({
        content: 'Привет всем!',
        room: null,
        author: { id: ann.user.id, name: ann.user.name },
      });
    }

    const saved = await prisma.message.findUnique({ where: { id: ack.data.id } });
    expect(saved).toMatchObject({ authorId: ann.user.id, content: 'Привет всем!', room: null });
  });

  test('пустое сообщение отклоняется валидацией и не сохраняется', async () => {
    const socket = await connect(ann.token);
    const before = await prisma.message.count();

    const ack = await socket.emitWithAck(EVENTS.MESSAGE_SEND, { content: '   ' });
    expect(ack.success).toBe(false);
    expect(ack.error.details[0].field).toBe('content');
    expect(await prisma.message.count()).toBe(before);
  });
});

describe('Socket.io: комнаты', () => {
  test('room:message получают только участники комнаты', async () => {
    const annSocket = await connect(ann.token);
    const bobSocket = await connect(bob.token);
    const eveSocket = await connect(eve.token); // не входит в комнату

    expect((await annSocket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'nodejs' })).success).toBe(true);
    await bobSocket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'nodejs' });

    const joined = await waitFor(annSocket, EVENTS.ROOM_USER_JOINED);
    expect(joined).toMatchObject({ room: 'nodejs', user: { id: bob.user.id } });

    const ack = await bobSocket.emitWithAck(EVENTS.ROOM_MESSAGE, { room: 'nodejs', content: 'Привет, комната' });
    expect(ack.success).toBe(true);

    const msg = await waitFor(annSocket, EVENTS.ROOM_MESSAGE);
    expect(msg).toMatchObject({ room: 'nodejs', content: 'Привет, комната', author: { id: bob.user.id } });

    await pause();
    expect(got(eveSocket, EVENTS.ROOM_MESSAGE)).toHaveLength(0);
    expect(got(eveSocket, EVENTS.MESSAGE_NEW)).toHaveLength(0);
  });

  test('room:join возвращает историю комнаты из БД', async () => {
    const socket = await connect(eve.token);
    const ack = await socket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'nodejs' });

    expect(ack.success).toBe(true);
    expect(ack.data.history.map((m) => m.content)).toContain('Привет, комната');
  });

  test('room:message без room:join — ошибка', async () => {
    const socket = await connect(ann.token);
    const ack = await socket.emitWithAck(EVENTS.ROOM_MESSAGE, { room: 'secret', content: 'hi' });
    expect(ack.success).toBe(false);
  });

  test('room:leave: остальные получают room:user-left, вышедший больше не получает сообщения', async () => {
    const annSocket = await connect(ann.token);
    const bobSocket = await connect(bob.token);
    await annSocket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'leave-test' });
    await bobSocket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'leave-test' });

    expect((await bobSocket.emitWithAck(EVENTS.ROOM_LEAVE, { room: 'leave-test' })).success).toBe(true);
    const left = await waitFor(annSocket, EVENTS.ROOM_USER_LEFT);
    expect(left).toMatchObject({ room: 'leave-test', user: { id: bob.user.id } });

    await annSocket.emitWithAck(EVENTS.ROOM_MESSAGE, { room: 'leave-test', content: 'кто тут?' });
    await waitFor(annSocket, EVENTS.ROOM_MESSAGE);
    await pause();
    expect(got(bobSocket, EVENTS.ROOM_MESSAGE)).toHaveLength(0);
  });

  test('невалидное имя комнаты — ошибка валидации VALIDATION_ERROR', async () => {
    const socket = await connect(ann.token);
    const ack = await socket.emitWithAck(EVENTS.ROOM_JOIN, { room: 'bad room!' });
    expect(ack.success).toBe(false);
    expect(ack.error.details[0].field).toBe('room');
  });
});

describe('REST: история сообщений', () => {
  test('GET /api/messages?room= возвращает сообщения из БД, без токена — 401', async () => {
    expect((await request(app).get('/api/messages')).status).toBe(401);

    const res = await request(app)
      .get('/api/messages?room=nodejs')
      .set('Authorization', `Bearer ${ann.token}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ room: 'nodejs', content: 'Привет, комната' });
  });
});
