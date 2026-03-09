const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const setupStartCommand = require('./commands/start');
const setupLanguageHandler = require('./commands/language');
const setupConnectHandler = require('./commands/connect');
const setupAccountHandler = require('./commands/account');
const setupReferralHandler = require('./commands/referral');
const setupSubscribeHandler = require('./commands/subscribe');
const setupHelpHandler = require('./commands/help');
const setupTermsHandler = require('./commands/terms');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });

// Webhook
const WEBHOOK_URL = `${process.env.DOMAIN}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL)
  .then(() => console.log(`✅ Webhook установлен: ${WEBHOOK_URL}`))
  .catch((err) => console.error('❌ Ошибка webhook:', err));

// Команды в меню Telegram
bot.setMyCommands([
  { command: '/start', description: '🚀 Start / Перезапуск' },
  { command: '/language', description: '🌐 Language / Язык' },
  { command: '/subscribe', description: '💳 Subscribe / Подписка' },
  { command: '/referral', description: '👥 Invite / Пригласить друга' },
  { command: '/help', description: '❓ Help / Помощь' },
  { command: '/terms', description: '📄 Terms / Правила' },
]);

// Подключаем команды
setupStartCommand(bot);
setupLanguageHandler(bot);
setupConnectHandler(bot);
setupAccountHandler(bot);
setupReferralHandler(bot);
setupSubscribeHandler(bot);
setupHelpHandler(bot);
setupTermsHandler(bot);

module.exports = bot;