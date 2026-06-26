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
// const setupPromoHandlers = require('./commands/promoHandlers'); // акция 14.06.2026 завершена — раскомментить при следующей

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });

// Обёртки для безопасных вызовов Telegram API
const ignorableErrors = [
  'message is not modified',
  "message can't be deleted",
  "message can't be edited",
  'query is too old',
];

const wrapBotMethod = (method) => {
  const orig = method.bind(bot);
  return async (...args) => {
    try {
      return await orig(...args);
    } catch (err) {
      const msg = err?.message || '';
      // Игнорируем известные некритичные ошибки Telegram
      if (ignorableErrors.some((e) => msg.includes(e))) return null;
      // Игнорируем 403 — бот заблокирован юзером
      if (err?.response?.statusCode === 403) return null;
      throw err;
    }
  };
};

bot.editMessageText = wrapBotMethod(bot.editMessageText);
bot.deleteMessage = wrapBotMethod(bot.deleteMessage);
bot.answerCallbackQuery = wrapBotMethod(bot.answerCallbackQuery);

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
// setupPromoHandlers(bot); // акция 14.06.2026 завершена — раскомментить при следующей

module.exports = bot;