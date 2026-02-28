const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const setupStartCommand = require('./commands/start');
const setupLanguageHandler = require('./commands/language');
const setupConnectHandler = require('./commands/connect');
const setupAccountHandler = require('./commands/account');
const setupReferralHandler = require('./commands/referral');
const setupSubscribeHandler = require('./commands/subscribe');
const setupHelpHandler = require('./commands/help');
const setupInstructionHandler = require('./commands/instruction');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });

// Webhook
const WEBHOOK_URL = `${process.env.DOMAIN}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL)
  .then(() => console.log(`✅ Webhook установлен: ${WEBHOOK_URL}`))
  .catch((err) => console.error('❌ Ошибка webhook:', err));

// Команды в меню Telegram
bot.setMyCommands([
  { command: '/start', description: '🚀 Start / Перезапуск' },
  { command: '/help', description: '❓ Help / Помощь' },
]);

// Подключаем команды
setupStartCommand(bot);
setupLanguageHandler(bot);
setupConnectHandler(bot);
setupAccountHandler(bot);
setupReferralHandler(bot);
setupSubscribeHandler(bot);
setupHelpHandler(bot);
setupInstructionHandler(bot);

module.exports = bot;