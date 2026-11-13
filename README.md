# Blog Platform API — итоговый проект (КТ №6)

Backend блог-платформы: пользователи с ролями, посты с тегами, комментарии и realtime-чат.
Объединяет все темы курса: REST и валидация, Prisma + PostgreSQL, JWT (access/refresh), RBAC с проверкой
владельца, безопасность (helmet, rate limit), Redis, Socket.io, тесты Jest + Supertest, Swagger, Docker и деплой.

**Стек:** Node.js 22, Express 5, Prisma 6, PostgreSQL 16, Redis 7 (ioredis), Joi, jsonwebtoken, bcryptjs,
helmet, express-rate-limit, Socket.io 4, swagger-ui-express, Jest, Supertest, Docker Compose.

**Демо:** https://blog-platform-api-uqqj.onrender.com/api/docs

## Быстрый старт (Docker)

```bash
cp .env.example .env          # поменяйте пароли и секреты
docker compose up --build     # поднимает app + db (PostgreSQL) + redis
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/api/docs
- Демо-чат: http://localhost:3000/chat.html
- Проверка: http://localhost:3000/health

При старте контейнер `app` сам применяет миграции (`prisma migrate deploy`) и создаёт администратора
из `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Данные PostgreSQL и Redis хранятся в volumes `pgdata` и `redisdata`
и сохраняются при `docker compose down` / `up` (удаляются только через `docker compose down -v`).

## Локальная разработка и тесты

```bash
npm install
cp .env.example .env
docker compose up -d db redis   # только база и Redis
npx prisma migrate dev          # миграции
npm run seed                    # администратор из .env
npm run dev                     # сервер с автоперезапуском
npm test                        # 78 тестов
```

Тесты работают в отдельной схеме `test` той же базы (`TEST_DATABASE_URL`), схема пересоздаётся перед каждым
запуском — рабочие данные не затрагиваются. Redis в тестах заменяется хранилищем в памяти.

## Модели базы данных

```
User 1─* Post *─* Tag
 │        │
 │        1
 │        *
 ├──1─* Comment
 └──1─* Message (чат)
```

| Модель  | Поля | Связи |
|---------|------|-------|
| User    | id, email (unique), name, password (bcrypt), role, createdAt | posts, comments, messages |
| Post    | id, title, content?, published, createdAt, updatedAt | author → User, tags ↔ Tag, comments |
| Tag     | id, name (unique) | posts ↔ Post (many-to-many) |
| Comment | id, content, createdAt, updatedAt | post → Post, author → User |
| Message | id, content, room? (null — общий чат), createdAt | author → User |

Удаление пользователя или поста каскадно удаляет связанные записи (`onDelete: Cascade`).

## Роли и права

| Действие | USER | MODERATOR | ADMIN |
|----------|:----:|:---------:|:-----:|
| Читать посты, комментарии, профили | ✓ | ✓ | ✓ |
| Создавать посты и комментарии | ✓ | ✓ | ✓ |
| Изменять / удалять посты и комментарии | свои | любые | любые |
| Изменять / удалять профиль | свой | свой | любой |
| Список пользователей `GET /api/users` | ✗ | ✓ | ✓ |
| Создать пользователя с ролью, сменить роль | ✗ | ✗ | ✓ |

Регистрация всегда даёт роль `USER`. Роль проверяется по базе при каждом запросе, поэтому смена роли
действует сразу, без перевыпуска токена.

## Эндпоинты

Все маршруты `/api/*` и `/admin/*` требуют заголовок `Authorization: Bearer <accessToken>`.
Полное описание с параметрами, телами и ответами — в Swagger UI (`/api/docs`).

| Метод | URL | Описание | Доступ |
|-------|-----|----------|--------|
| POST | /auth/register | Регистрация | все |
| POST | /auth/login | Вход: access token + refresh token в cookie (10 попыток / 15 мин) | все |
| POST | /auth/refresh | Новый access token по refresh cookie (ротация) | cookie |
| POST | /auth/logout | Отзыв refresh token, очистка cookie | cookie |
| GET | /auth/me | Текущий пользователь | авторизованные |
| GET | /api/users | Пользователи: `role`, `search`, `page`, `limit` | MODERATOR, ADMIN |
| POST | /api/users | Создать пользователя с любой ролью | ADMIN |
| GET | /api/users/:id | Пользователь с постами | авторизованные |
| PATCH | /api/users/:id | Обновить профиль | владелец, ADMIN |
| DELETE | /api/users/:id | Удалить аккаунт | владелец, ADMIN |
| PATCH | /admin/users/:id/role | Сменить роль | ADMIN |
| GET | /api/posts | Посты: `search`, `published`, `authorId`, `tag`, `page`, `limit` | авторизованные |
| POST | /api/posts | Создать пост (теги через `connectOrCreate`) | авторизованные |
| GET | /api/posts/:id | Пост с автором, тегами и комментариями | авторизованные |
| PATCH | /api/posts/:id | Обновить пост | владелец, MODERATOR, ADMIN |
| DELETE | /api/posts/:id | Удалить пост | владелец, MODERATOR, ADMIN |
| GET | /api/posts/:postId/comments | Комментарии поста: `authorId`, `page`, `limit` | авторизованные |
| POST | /api/posts/:postId/comments | Добавить комментарий | авторизованные |
| GET | /api/comments/:id | Один комментарий | авторизованные |
| PATCH | /api/comments/:id | Изменить комментарий | владелец, MODERATOR, ADMIN |
| DELETE | /api/comments/:id | Удалить комментарий | владелец, MODERATOR, ADMIN |
| GET | /api/messages | История чата: `room`, `page`, `limit` | авторизованные |
| GET | /health | Состояние сервиса, БД и Redis | все |
| GET | /api/docs | Swagger UI (JSON: `/api/docs.json`) | все |

### Формат ответов

```jsonc
// успех
{ "success": true, "data": { ... } }
// список
{ "success": true, "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 10, "pages": 5 } }
// ошибка
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Ошибка валидации",
  "details": [{ "field": "title", "message": "title is required" }] } }
```

| Статус | Код ошибки | Когда |
|--------|-----------|-------|
| 200 / 201 / 204 | — | успех / создано / удалено |
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | неверные данные (Joi) или битый JSON |
| 401 | `UNAUTHORIZED` | нет токена, токен недействителен, неверный пароль |
| 403 | `FORBIDDEN` | не хватает роли или чужой ресурс |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` | записи или маршрута нет |
| 409 | `CONFLICT` | email уже занят |
| 413 | `PAYLOAD_TOO_LARGE` | тело запроса больше 10kb |
| 429 | `RATE_LIMITED` | больше 10 попыток входа за 15 минут |
| 500 | `INTERNAL_ERROR` | внутренняя ошибка (в production без подробностей и stack trace) |

## Realtime-чат (Socket.io)

Подключение к тому же адресу с access token: `io(url, { auth: { token } })`. Без валидного токена
подключение отклоняется.

| Событие | Направление | Данные |
|---------|-------------|--------|
| `users:online` | сервер → новый клиент | список онлайн-пользователей |
| `user:online` / `user:offline` | сервер → остальные | `{ id, name, role }` |
| `message:send` → `message:new` | клиент → сервер → все | `{ content }` → `Message` |
| `room:join` / `room:leave` | клиент → сервер | `{ room }`, в ответе на join — история комнаты |
| `room:message` | клиент → сервер → участники | `{ room, content }` → `Message` |
| `room:user-joined` / `room:user-left` | сервер → комната | `{ room, user }` |

Ответы на клиентские события — в том же формате `{ success, data | error }`. Сообщения сохраняются в БД.

## Архитектура

```
src/
  app.js              Express: middleware, маршруты, Swagger, /health (экспортируется для тестов)
  server.js           HTTP-сервер + Socket.io, корректное завершение по SIGTERM
  config/
    index.js          все настройки из .env, PrismaClient (password скрыт глобально)
    redis.js          клиент Redis (если задан REDIS_URL)
    swagger.js        OpenAPI 3.0: все маршруты и components/schemas
  middleware/
    auth.js           authenticate — проверка access token, загрузка пользователя из БД
    rbac.js           authorize(...roles), authorizeOwnerOr(getOwnerId, ...roles) — роли и владелец
    validate.js       Joi-схемы и middleware валидации body/query/params
    rateLimit.js      лимит попыток входа (хранилище — Redis)
    errorHandler.js   единый обработчик ошибок и 404
  routes/             auth, users, admin, posts, comments, messages
  services/messages.js  работа с сообщениями чата (общая для REST и Socket.io)
  socket/             JWT-middleware, онлайн-статус, обработчики событий
  utils/              jwt, password (bcrypt), tokenStore (Redis), errors (AppError), response
prisma/               schema.prisma, migrations/, seed.js
__tests__/            setup.js, globalSetup.js, *.test.js, unit/
```

Ключевые решения:

- **Поток запроса:** `helmet` → `express.json({ limit: '10kb' })` → маршрут → `authenticate` → `authorize` /
  `authorizeOwnerOr` → `validate` → обработчик → `send()`; любая ошибка (в т.ч. из async-кода, Express 5)
  попадает в `errorHandler`.
- **Токены:** access token (15 мин) — в заголовке, в памяти клиента; refresh token (7 дней) — в httpOnly,
  SameSite=Strict cookie, недоступен JavaScript (защита от XSS). У refresh token есть `jti`: при обновлении
  и logout он заносится в Redis с TTL до истечения токена — повторно использовать его нельзя.
- **Redis:** счётчики rate limit и отозванные refresh-токены — общие для всех экземпляров приложения
  и переживают перезапуск (AOF).
- **Проверка владельца** отделена от ролей: `authorizeOwnerOr` получает функцию поиска владельца,
  поэтому одна реализация работает для постов, комментариев и профилей.
- **Пароли** хэшируются bcrypt и никогда не попадают в ответы (глобальный `omit` в PrismaClient).

## Деплой (Render)

В репозитории есть `render.yaml` (Blueprint): веб-сервис из Dockerfile, PostgreSQL и Redis (Key Value).

1. Залить репозиторий на GitHub.
2. Render → **New → Blueprint** → выбрать репозиторий.
3. Ввести `SEED_ADMIN_EMAIL` и `SEED_ADMIN_PASSWORD` (секреты JWT сгенерируются автоматически).
4. После сборки открыть `https://<имя-сервиса>.onrender.com/health` и `/api/docs`.

**Публичный URL:** https://blog-platform-api-uqqj.onrender.com

- Swagger UI: https://blog-platform-api-uqqj.onrender.com/api/docs
- Проверка: https://blog-platform-api-uqqj.onrender.com/health
- Демо-чат: https://blog-platform-api-uqqj.onrender.com/chat.html

Бесплатный тариф Render засыпает после 15 минут без запросов — первый запрос после паузы может идти до минуты.

## Переменные окружения

Полный список с комментариями — в `.env.example`. Секретов в коде нет: без `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` и `DATABASE_URL` приложение не запустится.
