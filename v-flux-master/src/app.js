const express = require('express');
const morgan = require('morgan');
const bot = require('./bot');
const nodeSyncRouter = require('./routes/nodeSyncRouter');

const app = express();

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/nodes', nodeSyncRouter);



// Telegram Webhook
app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

module.exports = app;