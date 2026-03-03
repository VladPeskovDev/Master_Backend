const crypto = require('crypto');
const { User } = require('../../db/models');
const { t, detectLang } = require('../locales');
const { showMainMenu } = require('./menu');

const detectRegion = (languageCode) => {
  const regionMap = { ru: 'ru', tr: 'tr', uz: 'uz', ar: 'uae', hi: 'uae' };
  const short = (languageCode || '').toLowerCase().slice(0, 2);
  return regionMap[short] || 'uae';
};

const setupStartCommand = (bot) => {
  bot.onText(/\/start(.*)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id;
      const referralParam = match[1]?.trim();

      let user = await User.findOne({ where: { telegram_id: telegramId } });

      if (user) {
        const lang = user.lang;
        await bot.sendMessage(
          chatId,
          t(lang, 'welcome_back', { name: msg.from.first_name || 'User' }),
        );
        return showMainMenu(bot, chatId, lang);
      }

      const lang = detectLang(msg.from.language_code);
      const region = detectRegion(msg.from.language_code);

      const uuid = crypto.randomUUID();
      const subToken = crypto.randomBytes(16).toString('hex');
      const referralCode = crypto.randomBytes(4).toString('hex');

      let referredBy = null;
      if (referralParam && referralParam.startsWith(' ref_')) {
        const refCode = referralParam.replace(' ref_', '');
        const referrer = await User.findOne({ where: { referral_code: refCode } });
        if (referrer) referredBy = referrer.id;
      }

      user = await User.create({
        telegram_id: telegramId,
        username: msg.from.username || null,
        first_name: msg.from.first_name || null,
        last_name: msg.from.last_name || null,
        uuid,
        sub_token: subToken,
        lang,
        region,
        referral_code: referralCode,
        referred_by: referredBy,
      });

      let welcomeText = t(lang, 'welcome');
      if (referredBy) {
        welcomeText += '\n\n' + t(lang, 'referral_registered');
      }

      await bot.sendMessage(chatId, welcomeText);
      return showMainMenu(bot, chatId, lang);
    } catch (err) {
      console.error('❌ Ошибка в /start:', err);
      await bot.sendMessage(msg.chat.id, '❌ Error. Please try again.');
    }
  });
};

module.exports = setupStartCommand;