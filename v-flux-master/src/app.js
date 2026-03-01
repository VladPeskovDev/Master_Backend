const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const bot = require('./bot');
const nodeSyncRouter = require('./routes/nodeSyncRouter');
const subRouter = require('./routes/subRouter');
const adminNodesRouter = require('./routes/adminNodesRouter');
const adminUsersRouter = require('./routes/adminUsersRouter');
const { subLimiter, adminLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/nodes', nodeSyncRouter);
app.use('/sub', subLimiter, subRouter);
app.use('/api/admin/nodes', adminLimiter, adminNodesRouter);
app.use('/api/admin/users', adminLimiter, adminUsersRouter);


// Telegram Webhook
app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

module.exports = app;