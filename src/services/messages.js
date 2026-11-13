const { prisma, chat } = require('../config');
const { paginationMeta } = require('../utils/response');
const { authorInclude } = require('../routes/includes');

const messageInclude = { author: authorInclude };

// room = null — общий чат
function createMessage({ authorId, content, room = null }) {
  return prisma.message.create({
    data: { authorId, content, room },
    include: messageInclude,
  });
}

// Последние сообщения комнаты в хронологическом порядке
async function getRecentMessages(room = null, limit = chat.historyLimit) {
  const messages = await prisma.message.findMany({
    where: { room },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });
  return messages.reverse();
}

// Новые сообщения первыми
async function listMessages({ room = null, page, limit }) {
  const where = { room };
  const [data, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: messageInclude,
    }),
    prisma.message.count({ where }),
  ]);
  return { data, meta: paginationMeta(total, page, limit) };
}

module.exports = { createMessage, getRecentMessages, listMessages };
