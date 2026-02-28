const { User } = require('../../db/models');
const { t, SUPPORTED_LANGS } = require('../locales');
const { showMainMenu } = require('./menu');

const LANG_FLAGS = {
  ru: '🇷🇺 Русский',
  en: '🇬🇧 English',
  ar: '🇦🇪 العربية',
  uz: '🇺🇿 O\'zbekcha',
  hi: '🇮🇳 हिंदी',
  tr: '🇹🇷 Türkçe',
};

const setupLanguageHandler = (bot) => {
  // Показать выбор языка
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'language') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const buttons = SUPPORTED_LANGS.map((lang) => [
        { text: LANG_FLAGS[lang], callback_data: `set_lang_${lang}` },
      ]);

      // Кнопка назад
      buttons.push([{ text: t(user.lang, 'btn_back'), callback_data: 'back_to_menu' }]);

      await bot.editMessageText(t(user.lang, 'select_language'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка language:', err);
    }
  });

  // Установить язык
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('set_lang_')) return;

      const lang = query.data.replace('set_lang_', '');
      if (!SUPPORTED_LANGS.includes(lang)) return;

      await User.update({ lang }, { where: { telegram_id: query.from.id } });

      await bot.editMessageText(t(lang, 'language_set'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      });

      await bot.answerCallbackQuery(query.id);

      return showMainMenu(bot, query.message.chat.id, lang);
    } catch (err) {
      console.error('❌ Ошибка set_lang:', err);
    }
  });

  // Назад в меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'back_to_menu') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      await bot.deleteMessage(query.message.chat.id, query.message.message_id);
      await bot.answerCallbackQuery(query.id);

      return showMainMenu(bot, query.message.chat.id, user.lang);
    } catch (err) {
      console.error('❌ Ошибка back_to_menu:', err);
    }
  });
};

module.exports = setupLanguageHandler;