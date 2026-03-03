const { User } = require('../../db/models');
const { t } = require('../locales');

const setupTermsHandler = (bot) => {
  // Кнопка из меню (если добавишь)
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'terms') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      await bot.editMessageText(t(user.lang, 'terms_text'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(user.lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка terms:', err);
    }
  });

  // Слеш-команда /terms
  bot.onText(/\/terms/, async (msg) => {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      const lang = user?.lang || 'en';

      await bot.sendMessage(msg.chat.id, t(lang, 'terms_text'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });
    } catch (err) {
      console.error('❌ Ошибка /terms:', err);
    }
  });
};

module.exports = setupTermsHandler;