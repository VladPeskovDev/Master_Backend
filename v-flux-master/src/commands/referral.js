const { User, ReferralReward } = require('../../db/models');
const { t } = require('../locales');
const { showMainMenu } = require('./menu');

const sendReferralInfo = async (bot, chatId, user) => {
  const lang = user.lang;
  const botInfo = await bot.getMe();
  const link = `https://t.me/${botInfo.username}?start=ref_${user.referral_code}`;

  const rewards = await ReferralReward.findAll({ where: { referrer_id: user.id } });
  const count = rewards.length;
  const totalDays = rewards.reduce((sum, r) => sum + r.days_awarded, 0);

  let text = t(lang, 'referral_title') + '\n\n';
  text += t(lang, 'referral_description') + '\n\n';
  text += t(lang, 'referral_your_link', { link }) + '\n\n';
  text += t(lang, 'referral_stats', { count, days: totalDays });

  return { text, lang };
};

const setupReferralHandler = (bot) => {
  // Кнопка из меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'referral') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const { text, lang } = await sendReferralInfo(bot, query.message.chat.id, user);

      await bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка referral:', err);
    }
  });

  // Слеш-команда /referral
  bot.onText(/\/referral/, async (msg) => {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) return;

      const { text, lang } = await sendReferralInfo(bot, msg.chat.id, user);

      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });
    } catch (err) {
      console.error('❌ Ошибка /referral:', err);
    }
  });
};

module.exports = setupReferralHandler;