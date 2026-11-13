const http = require('http');
const app = require('./app');
const { port, prisma } = require('./config');
const { redis } = require('./config/redis');
const { initSocket } = require('./socket');

// Express и Socket.io работают на одном HTTP-сервере и одном порту
const server = http.createServer(app);
const io = initSocket(server);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Swagger UI:  http://localhost:${port}/api/docs`);
  console.log(`Chat demo:   http://localhost:${port}/chat.html`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  io.close();
  await prisma.$disconnect();
  if (redis) await redis.quit().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
