const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const setupStartCommand = require('./commands/start');
const setupLanguageHandler = require('./commands/language');
const setupStubs = require('./commands/stubs');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });

// Webhook
const WEBHOOK_URL = `${process.env.DOMAIN}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL)
  .then(() => console.log(`✅ Webhook установлен: ${WEBHOOK_URL}`))
  .catch((err) => console.error('❌ Ошибка webhook:', err));

// Команды в меню Telegram
bot.setMyCommands([
  { command: '/start', description: '🚀 Start / Перезапуск' },
]);

// Подключаем команды
setupStartCommand(bot);
setupLanguageHandler(bot);
setupStubs(bot);

module.exports = bot;