// Общие include/select для Prisma-запросов: какие данные автора отдавать наружу
const authorInclude = { select: { id: true, name: true, role: true } };

const commentInclude = { author: authorInclude };

module.exports = { authorInclude, commentInclude };
