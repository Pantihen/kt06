const bcrypt = require('bcryptjs');
const { bcryptRounds } = require('../config');

const hashPassword = (plain) => bcrypt.hash(plain, bcryptRounds);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, comparePassword };
