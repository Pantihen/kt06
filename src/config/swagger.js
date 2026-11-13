// OpenAPI 3.0 спецификация API. Swagger UI: /api/docs, JSON: /api/docs.json
const { pagination, chat, rateLimit } = require('./index');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const resp = (name) => ({ $ref: `#/components/responses/${name}` });
const param = (name) => ({ $ref: `#/components/parameters/${name}` });
const bearer = [{ bearerAuth: [] }];

// Обёртки единого формата ответа
const ok = (description, schema) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: { success: { type: 'boolean', example: true }, data: schema },
      },
    },
  },
});

const list = (description, itemSchema) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: itemSchema },
          meta: ref('PaginationMeta'),
        },
      },
    },
  },
});

const jsonBody = (schemaName) => ({
  required: true,
  content: { 'application/json': { schema: ref(schemaName) } },
});

const noContent = { description: 'Успешно, тело ответа пустое' };

// Стандартные ответы ошибок для защищённых маршрутов
const authErrors = { 401: resp('Unauthorized') };
const withId = { 400: resp('ValidationError'), 401: resp('Unauthorized'), 404: resp('NotFound') };

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Blog Platform API',
    version: '1.0.0',
    description: [
      'Итоговый проект: API блог-платформы — пользователи, посты, теги, комментарии и realtime-чат.',
      '',
      '**Аутентификация.** `POST /auth/login` возвращает `accessToken` (15 минут) и ставит refresh token',
      'в httpOnly cookie (7 дней). Нажмите **Authorize** и вставьте access token.',
      '',
      '**Роли.** `USER` — свои посты и комментарии; `MODERATOR` — любые посты и комментарии,',
      'список пользователей; `ADMIN` — всё, включая управление пользователями и ролями.',
      '',
      '**Формат ответов.** Успех: `{ success: true, data, meta? }`.',
      'Ошибка: `{ success: false, error: { code, message, details? } }`.',
      '',
      '**Realtime-чат** (Socket.io, тот же адрес): события описаны в README.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Текущий сервер' }],
  tags: [
    { name: 'Auth', description: 'Регистрация, вход, токены' },
    { name: 'Users', description: 'Пользователи' },
    { name: 'Admin', description: 'Администрирование (только ADMIN)' },
    { name: 'Posts', description: 'Посты блога' },
    { name: 'Comments', description: 'Комментарии к постам' },
    { name: 'Messages', description: 'История чата' },
    { name: 'System', description: 'Служебные маршруты' },
  ],

  paths: {
    // ---------------- Auth ----------------
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Регистрация',
        description: 'Пароль хэшируется bcrypt. Роль всегда `USER`, поле `role` в теле игнорируется.',
        requestBody: jsonBody('RegisterInput'),
        responses: {
          201: ok('Пользователь создан', ref('User')),
          400: resp('ValidationError'),
          409: resp('Conflict'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход',
        description: `Возвращает access token и ставит cookie \`refreshToken\` (httpOnly, path=/auth). Лимит: ${rateLimit.login.limit} запросов за 15 минут с одного IP.`,
        requestBody: jsonBody('LoginInput'),
        responses: {
          200: {
            ...ok('Успешный вход', ref('LoginResult')),
            headers: {
              'Set-Cookie': {
                description: 'refreshToken=<jwt>; HttpOnly; SameSite=Strict; Path=/auth',
                schema: { type: 'string' },
              },
            },
          },
          400: resp('ValidationError'),
          401: resp('Unauthorized'),
          429: resp('TooManyRequests'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Обновить access token',
        description: 'Берёт refresh token из cookie. Старый refresh token отзывается (ротация), выдаётся новый.',
        security: [{ refreshCookie: [] }],
        responses: {
          200: ok('Новый access token', ref('AccessToken')),
          401: resp('Unauthorized'),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Выход',
        description: 'Отзывает refresh token (запись в Redis) и очищает cookie.',
        security: [{ refreshCookie: [] }],
        responses: { 204: noContent },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Текущий пользователь',
        security: bearer,
        responses: { 200: ok('Текущий пользователь', ref('User')), ...authErrors },
      },
    },

    // ---------------- Users ----------------
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'Список пользователей (MODERATOR, ADMIN)',
        security: bearer,
        parameters: [
          { name: 'role', in: 'query', schema: ref('Role'), description: 'Фильтр по роли' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Поиск по имени и email' },
          param('page'),
          param('limit'),
        ],
        responses: {
          200: list('Пользователи', ref('UserWithCounts')),
          400: resp('ValidationError'),
          ...authErrors,
          403: resp('Forbidden'),
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Создать пользователя с любой ролью (ADMIN)',
        security: bearer,
        requestBody: jsonBody('UserCreateInput'),
        responses: {
          201: ok('Пользователь создан', ref('User')),
          400: resp('ValidationError'),
          ...authErrors,
          403: resp('Forbidden'),
          409: resp('Conflict'),
        },
      },
    },
    '/api/users/{id}': {
      parameters: [param('id')],
      get: {
        tags: ['Users'],
        summary: 'Пользователь с его постами',
        description: 'Посты отсортированы по дате создания, новые первыми.',
        security: bearer,
        responses: { 200: ok('Пользователь', ref('UserWithPosts')), ...withId },
      },
      patch: {
        tags: ['Users'],
        summary: 'Обновить профиль (свой или любой для ADMIN)',
        security: bearer,
        requestBody: jsonBody('UserUpdateInput'),
        responses: {
          200: ok('Обновлённый пользователь', ref('User')),
          ...withId,
          403: resp('Forbidden'),
          409: resp('Conflict'),
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Удалить аккаунт (свой или любой для ADMIN)',
        description: 'Посты, комментарии и сообщения пользователя удаляются каскадно.',
        security: bearer,
        responses: { 204: noContent, ...withId, 403: resp('Forbidden') },
      },
    },
    '/admin/users/{id}/role': {
      parameters: [param('id')],
      patch: {
        tags: ['Admin'],
        summary: 'Сменить роль пользователя',
        security: bearer,
        requestBody: jsonBody('RoleUpdateInput'),
        responses: {
          200: ok('Пользователь с новой ролью', ref('User')),
          ...withId,
          403: resp('Forbidden'),
        },
      },
    },

    // ---------------- Posts ----------------
    '/api/posts': {
      get: {
        tags: ['Posts'],
        summary: 'Список постов с фильтрацией и пагинацией',
        security: bearer,
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Поиск по заголовку (без учёта регистра)' },
          { name: 'published', in: 'query', schema: { type: 'boolean' }, description: 'Статус публикации' },
          { name: 'authorId', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Автор' },
          { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Имя тега' },
          param('page'),
          param('limit'),
        ],
        responses: { 200: list('Посты, новые первыми', ref('Post')), 400: resp('ValidationError'), ...authErrors },
      },
      post: {
        tags: ['Posts'],
        summary: 'Создать пост',
        description: 'Автор — текущий пользователь. Теги создаются через `connectOrCreate` по имени.',
        security: bearer,
        requestBody: jsonBody('CreatePostDto'),
        responses: { 201: ok('Пост создан', ref('Post')), 400: resp('ValidationError'), ...authErrors },
      },
    },
    '/api/posts/{id}': {
      parameters: [param('id')],
      get: {
        tags: ['Posts'],
        summary: 'Пост с автором, тегами и последними 10 комментариями',
        security: bearer,
        responses: { 200: ok('Пост', ref('PostWithComments')), ...withId },
      },
      patch: {
        tags: ['Posts'],
        summary: 'Обновить пост (свой; MODERATOR и ADMIN — любой)',
        description: 'Поле `tags` заменяет набор тегов целиком.',
        security: bearer,
        requestBody: jsonBody('UpdatePostDto'),
        responses: { 200: ok('Обновлённый пост', ref('Post')), ...withId, 403: resp('Forbidden') },
      },
      delete: {
        tags: ['Posts'],
        summary: 'Удалить пост (свой; MODERATOR и ADMIN — любой)',
        description: 'Комментарии поста удаляются каскадно.',
        security: bearer,
        responses: { 204: noContent, ...withId, 403: resp('Forbidden') },
      },
    },

    // ---------------- Comments ----------------
    '/api/posts/{postId}/comments': {
      parameters: [param('postId')],
      get: {
        tags: ['Comments'],
        summary: 'Комментарии поста',
        security: bearer,
        parameters: [
          { name: 'authorId', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Автор комментария' },
          param('page'),
          param('limit'),
        ],
        responses: { 200: list('Комментарии, старые первыми', ref('Comment')), ...withId },
      },
      post: {
        tags: ['Comments'],
        summary: 'Добавить комментарий',
        description: 'Автор — текущий пользователь.',
        security: bearer,
        requestBody: jsonBody('CreateCommentDto'),
        responses: { 201: ok('Комментарий создан', ref('Comment')), ...withId },
      },
    },
    '/api/comments/{id}': {
      parameters: [param('id')],
      get: {
        tags: ['Comments'],
        summary: 'Один комментарий',
        security: bearer,
        responses: { 200: ok('Комментарий', ref('Comment')), ...withId },
      },
      patch: {
        tags: ['Comments'],
        summary: 'Изменить комментарий (свой; MODERATOR и ADMIN — любой)',
        security: bearer,
        requestBody: jsonBody('UpdateCommentDto'),
        responses: { 200: ok('Обновлённый комментарий', ref('Comment')), ...withId, 403: resp('Forbidden') },
      },
      delete: {
        tags: ['Comments'],
        summary: 'Удалить комментарий (свой; MODERATOR и ADMIN — любой)',
        security: bearer,
        responses: { 204: noContent, ...withId, 403: resp('Forbidden') },
      },
    },

    // ---------------- Messages ----------------
    '/api/messages': {
      get: {
        tags: ['Messages'],
        summary: 'История чата',
        description: 'Без `room` — общий чат. Новые сообщения первыми. Отправка сообщений — через Socket.io.',
        security: bearer,
        parameters: [
          { name: 'room', in: 'query', schema: { type: 'string', example: 'nodejs' }, description: 'Имя комнаты' },
          param('page'),
          param('limit'),
        ],
        responses: { 200: list('Сообщения', ref('Message')), 400: resp('ValidationError'), ...authErrors },
      },
    },

    // ---------------- System ----------------
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Проверка работоспособности',
        responses: {
          200: ok('Сервис работает', ref('Health')),
          503: ok('База данных недоступна', ref('Health')),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refreshToken' },
    },

    parameters: {
      id: { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 },
      postId: { name: 'postId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 },
      page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: pagination.maxLimit, default: pagination.defaultLimit },
      },
    },

    schemas: {
      Role: { type: 'string', enum: ['USER', 'MODERATOR', 'ADMIN'], example: 'USER' },

      // ----- модели -----
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'ann@example.com' },
          name: { type: 'string', example: 'Ann' },
          role: ref('Role'),
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UserWithCounts: {
        allOf: [
          ref('User'),
          {
            type: 'object',
            properties: {
              _count: {
                type: 'object',
                properties: { posts: { type: 'integer' }, comments: { type: 'integer' } },
              },
            },
          },
        ],
      },
      UserWithPosts: {
        allOf: [
          ref('User'),
          { type: 'object', properties: { posts: { type: 'array', items: ref('PostSummary') } } },
        ],
      },
      Author: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Ann' },
          role: ref('Role'),
        },
      },
      Tag: {
        type: 'object',
        properties: { id: { type: 'integer', example: 1 }, name: { type: 'string', example: 'nodejs' } },
      },
      PostSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'Привет, Prisma' },
          content: { type: 'string', nullable: true },
          published: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          authorId: { type: 'integer' },
          tags: { type: 'array', items: ref('Tag') },
          _count: { type: 'object', properties: { comments: { type: 'integer' } } },
        },
      },
      Post: {
        allOf: [ref('PostSummary'), { type: 'object', properties: { author: ref('Author') } }],
      },
      PostWithComments: {
        allOf: [ref('Post'), { type: 'object', properties: { comments: { type: 'array', items: ref('Comment') } } }],
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          content: { type: 'string', example: 'Отличная статья!' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          postId: { type: 'integer', example: 1 },
          authorId: { type: 'integer', example: 2 },
          author: ref('Author'),
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          content: { type: 'string', example: 'Всем привет!' },
          room: { type: 'string', nullable: true, description: 'null — общий чат', example: 'nodejs' },
          createdAt: { type: 'string', format: 'date-time' },
          authorId: { type: 'integer' },
          author: ref('Author'),
        },
      },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          db: { type: 'string', enum: ['up', 'down'] },
          redis: { type: 'string', enum: ['up', 'down', 'disabled'] },
        },
      },

      // ----- входные данные (DTO) -----
      RegisterInput: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ann@example.com' },
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Ann' },
          password: { type: 'string', minLength: 6, maxLength: 72, example: 'secret123' },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ann@example.com' },
          password: { type: 'string', example: 'secret123' },
        },
      },
      UserCreateInput: {
        allOf: [ref('RegisterInput'), { type: 'object', properties: { role: ref('Role') } }],
      },
      UserUpdateInput: {
        type: 'object',
        minProperties: 1,
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          password: { type: 'string', minLength: 6, maxLength: 72 },
        },
      },
      RoleUpdateInput: {
        type: 'object',
        required: ['role'],
        properties: { role: ref('Role') },
      },
      CreatePostDto: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200, example: 'Привет, Prisma' },
          content: { type: 'string', nullable: true, maxLength: 20000, example: 'Текст поста' },
          published: { type: 'boolean', default: false },
          tags: {
            type: 'array',
            maxItems: 10,
            uniqueItems: true,
            items: { type: 'string', maxLength: 50 },
            example: ['nodejs', 'prisma'],
          },
        },
      },
      UpdatePostDto: {
        type: 'object',
        minProperties: 1,
        description: 'Любые поля CreatePostDto, минимум одно.',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          content: { type: 'string', nullable: true, maxLength: 20000 },
          published: { type: 'boolean' },
          tags: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', maxLength: 50 } },
        },
      },
      CreateCommentDto: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1, maxLength: 2000, example: 'Отличная статья!' } },
      },
      UpdateCommentDto: { $ref: '#/components/schemas/CreateCommentDto' },

      // ----- ответы -----
      LoginResult: {
        type: 'object',
        properties: { accessToken: { type: 'string' }, user: ref('User') },
      },
      AccessToken: {
        type: 'object',
        properties: { accessToken: { type: 'string' } },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: pagination.defaultLimit },
          pages: { type: 'integer', example: 5 },
        },
      },
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string', example: 'Запись не найдена' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string', example: 'title' },
                    message: { type: 'string', example: 'title is required' },
                  },
                },
              },
            },
          },
        },
      },
    },

    responses: {
      ValidationError: errorResponse('Ошибка валидации', 'VALIDATION_ERROR', 'Ошибка валидации', [
        { field: 'title', message: 'title is required' },
      ]),
      Unauthorized: errorResponse('Нет токена или он недействителен', 'UNAUTHORIZED', 'Требуется авторизация'),
      Forbidden: errorResponse('Недостаточно прав', 'FORBIDDEN', 'Недостаточно прав'),
      NotFound: errorResponse('Не найдено', 'NOT_FOUND', 'Запись не найдена'),
      Conflict: errorResponse('Конфликт уникальности', 'CONFLICT', 'Значение поля email уже занято'),
      TooManyRequests: errorResponse('Превышен лимит запросов', 'RATE_LIMITED', 'Слишком много попыток входа'),
    },
  },
};

function errorResponse(description, code, message, details) {
  const example = { success: false, error: { code, message } };
  if (details) example.error.details = details;
  return {
    description,
    content: { 'application/json': { schema: ref('Error'), example } },
  };
}

// Длина сообщения чата — для справки в описании
spec.components.schemas.Message.properties.content.maxLength = chat.maxMessageLength;

module.exports = spec;
