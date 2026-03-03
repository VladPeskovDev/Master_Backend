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

const buildLanguageKeyboard = (lang) => {
  const buttons = SUPPORTED_LANGS.map((l) => [
    { text: LANG_FLAGS[l], callback_data: `set_lang_${l}` },
  ]);
  buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }]);
  return buttons;
};

const setupLanguageHandler = (bot) => {
  // Кнопка из меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'language') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      await bot.editMessageText(t(user.lang, 'select_language'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: buildLanguageKeyboard(user.lang) },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка language:', err);
    }
  });

  // Слеш-команда /language
  bot.onText(/\/language/, async (msg) => {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) return;

      await bot.sendMessage(msg.chat.id, t(user.lang, 'select_language'), {
        reply_markup: { inline_keyboard: buildLanguageKeyboard(user.lang) },
      });
    } catch (err) {
      console.error('❌ Ошибка /language:', err);
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