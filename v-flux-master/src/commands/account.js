const { User, Subscription, Plan, ReferralReward } = require('../../db/models');
const { t } = require('../locales');
const { showMainMenu } = require('./menu');

const formatBytes = (bytes) => {
  const gb = Number(bytes) / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
};

const setupAccountHandler = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'account') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const sub = await Subscription.findOne({
        where: { user_id: user.id, active: true },
        include: [{ model: Plan }],
      });

      let text = t(lang, 'account_title') + '\n\n';
      text += t(lang, 'account_id', { id: user.telegram_id }) + '\n\n';

      if (sub) {
        const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - Date.now()) / (1000 * 60 * 60 * 24)));
        const expiresDate = new Date(sub.expires_at).toLocaleDateString();

        text += t(lang, 'account_plan', { plan: sub.Plan.name }) + '\n';
        text += t(lang, 'account_status_active') + '\n';
        text += t(lang, 'account_expires', { date: expiresDate }) + '\n';
        text += t(lang, 'account_days_left', { days: daysLeft }) + '\n\n';

        // Триал — показываем трафик, платная — безлимит
        if (sub.Plan.is_trial) {
          text += t(lang, 'account_traffic', {
            used: formatBytes(sub.traffic_used),
            limit: formatBytes(sub.traffic_limit),
          });
        } else {
          text += t(lang, 'account_traffic_unlimited');
        }
      } else {
        text += t(lang, 'account_no_sub');
      }

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
      console.error('❌ Ошибка account:', err);
    }
  });
};

module.exports = setupAccountHandler;