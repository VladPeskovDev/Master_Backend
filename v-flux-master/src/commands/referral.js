const { User, ReferralReward } = require('../../db/models');
const { t } = require('../locales');

const sendReferralInfo = async (bot, chatId, user) => {
  const lang = user.lang;
  const botInfo = await bot.getMe();
  const link = 'https://t.me/' + botInfo.username + '?start=ref_' + user.referral_code;
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('🚀 V-Flux VPN — 3 days free! 👇');

  const rewards = await ReferralReward.findAll({ where: { referrer_id: user.id } });
  const count = rewards.length;
  const totalDays = rewards.reduce((sum, r) => sum + r.days_awarded, 0);

  let text = t(lang, 'referral_title') + '\n\n';
  text += t(lang, 'referral_description') + '\n\n';
  text += t(lang, 'referral_your_link', { link }) + '\n\n';
  text += t(lang, 'referral_stats', { count, days: totalDays });

  const buttons = [
    [{ text: '📤 Поделиться с другом', url: shareUrl }],
    [{ text: '📋 Скопировать ссылку', copy_text: { text: link } }],
    [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
  ];

  return { text, lang, buttons };
};

const setupReferralHandler = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'referral') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const { text, buttons } = await sendReferralInfo(bot, query.message.chat.id, user);

      await bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка referral:', err);
    }
  });

  bot.onText(/\/referral/, async (msg) => {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) return;

      const { text, buttons } = await sendReferralInfo(bot, msg.chat.id, user);

      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('❌ Ошибка /referral:', err);
    }
  });
};

module.exports = setupReferralHandler;