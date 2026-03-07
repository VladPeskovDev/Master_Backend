const { User } = require('../../db/models');
const { t } = require('../locales');

const setupInstructionHandler = (bot) => {
  // Кнопка "Инструкция" из меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'instruction') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      await bot.editMessageText(t(lang, 'instruction_choose'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_iphone'), callback_data: 'instr_ios' }],
            [{ text: t(lang, 'btn_android_device'), callback_data: 'instr_android' }],
            [{ text: t(lang, 'btn_computer'), callback_data: 'instr_desktop' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка instruction:', err);
    }
  });

  // Инструкции по платформам
  ['ios', 'android', 'desktop'].forEach((platform) => {
    bot.on('callback_query', async (query) => {
      try {
        if (query.data !== `instr_${platform}`) return;

        const user = await User.findOne({ where: { telegram_id: query.from.id } });
        if (!user) return;

        await bot.editMessageText(t(user.lang, `instruction_${platform}`), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(user.lang, 'btn_back'), callback_data: 'instruction' }],
            ],
          },
        });

        await bot.answerCallbackQuery(query.id);
      } catch (err) {
        console.error(`❌ Ошибка instr_${platform}:`, err);
      }
    });
  });
};

module.exports = setupInstructionHandler;