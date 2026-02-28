const { t } = require('../locales');

const showMainMenu = async (bot, chatId, lang) => {
  const keyboard = {
    inline_keyboard: [
      [{ text: t(lang, 'btn_connect'), callback_data: 'connect' }],
      [
        { text: t(lang, 'btn_account'), callback_data: 'account' },
        { text: t(lang, 'btn_subscribe'), callback_data: 'subscribe' },
      ],
      [
        { text: t(lang, 'btn_referral'), callback_data: 'referral' },
        { text: t(lang, 'btn_language'), callback_data: 'language' },
      ],
      [{ text: t(lang, 'btn_help'), callback_data: 'help' }],
    ],
  };

  await bot.sendMessage(chatId, t(lang, 'main_menu'), { reply_markup: keyboard });
};

module.exports = { showMainMenu };