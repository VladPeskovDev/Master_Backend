const express = require('express');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const bot = require('./bot');
const nodeSyncRouter = require('./routes/nodeSyncRouter');
const subRouter = require('./routes/subRouter');
const adminNodesRouter = require('./routes/adminNodesRouter');
const adminUsersRouter = require('./routes/adminUsersRouter');
const { subLimiter, adminLimiter, botLimiter } = require('./middleware/rateLimiter');
const { nodeIpWhitelist, adminIpWhitelist } = require('./middleware/ipWhitelist');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/nodes', nodeIpWhitelist, nodeSyncRouter);
app.use('/sub', subLimiter, subRouter);
app.use('/api/admin/nodes', adminIpWhitelist, adminLimiter, adminNodesRouter);
app.use('/api/admin/users', adminIpWhitelist, adminLimiter, adminUsersRouter);


// Admin panel
const adminPanelPath = path.join(__dirname, '..', 'public', 'admin');
app.use('/cpanel-9f2k', express.static(adminPanelPath));
app.get('/cpanel-9f2k/{*path}', (req, res) => {
  res.sendFile(path.join(adminPanelPath, 'index.html'));
});

// Telegram Webhook
app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, botLimiter, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

module.exports = app;