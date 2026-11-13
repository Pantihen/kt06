const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const { prisma, trustProxy, bodyLimit } = require('./config');
const { redis } = require('./config/redis');
const swaggerSpec = require('./config/swagger');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const { postComments, comments } = require('./routes/comments');
const messagesRouter = require('./routes/messages');
const { notFoundRoute, errorHandler } = require('./middleware/errorHandler');
const { send } = require('./utils/response');

const app = express();

app.set('trust proxy', trustProxy);
app.disable('x-powered-by');
app.use(helmet()); // X-Frame-Options, X-Content-Type-Options, CSP и др.
app.use(express.json({ limit: bodyLimit }));
app.use(cookieParser());

// Демо-клиент чата: /chat.html
app.use(express.static(path.join(__dirname, '..', 'public')));

// Документация: Swagger UI и сырой OpenAPI JSON
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Blog Platform API',
    swaggerOptions: { persistAuthorization: true },
  })
);

// Проверка работоспособности (для Docker и хостинга)
app.get('/health', async (req, res) => {
  let db = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }
  let cache = 'disabled';
  if (redis) cache = redis.status === 'ready' ? 'up' : 'down';

  send(res, { status: db === 'up' ? 'ok' : 'degraded', db, redis: cache }, {
    status: db === 'up' ? 200 : 503,
  });
});

app.get('/', (req, res) => res.redirect('/api/docs'));

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/posts/:postId/comments', postComments);
app.use('/api/posts', postsRouter);
app.use('/api/comments', comments);
app.use('/api/messages', messagesRouter);

app.use(notFoundRoute);
app.use(errorHandler);

module.exports = app;
