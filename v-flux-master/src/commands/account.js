const { User, Subscription, Plan } = require('../../db/models');
const { t } = require('../locales');

const formatBytes = (bytes) => {
  if (bytes == null) return '∞';
  const gb = Number(bytes) / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const PLAN_NAME_MAP = {
  Trial: 'plan_name_trial',
  Monthly: 'plan_name_monthly',
  'Semi-Annual': 'plan_name_semi',
  Annual: 'plan_name_annual',
};

const setupAccountHandler = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'account') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      // Ищем последнюю подписку (любую, не только active)
      const sub = await Subscription.findOne({
        where: { user_id: user.id },
        include: [{ model: Plan }],
        order: [['createdAt', 'DESC']],
      });

      // === Нет подписки вообще ===
      if (!sub) {
        await bot.editMessageText(t(lang, 'account_no_sub'), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_get_subscription'), callback_data: 'subscribe' }],
              [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
            ],
          },
        });
        return bot.answerCallbackQuery(query.id);
      }

      const isTrial = sub.Plan?.is_trial;
      const isActive = sub.active;
      const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - Date.now()) / (1000 * 60 * 60 * 24)));

      // Локализованное название тарифа
      const planNameKey = PLAN_NAME_MAP[sub.Plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: sub.Plan.duration_days });

      let text = t(lang, 'account_title') + '\n\n';
      text += t(lang, 'account_plan', { plan: planName }) + '\n';

      if (isActive) {
        // === Активная подписка (триал или платная) ===
        text += t(lang, 'account_status_active') + '\n';
        text += t(lang, 'account_expires', { date: formatDate(sub.expires_at), days: daysLeft }) + '\n\n';

        if (isTrial) {
          text += t(lang, 'account_traffic', {
            used: formatBytes(sub.traffic_used),
            limit: formatBytes(sub.traffic_limit),
          });
          text += t(lang, 'account_trial_cta');
        } else {
          text += t(lang, 'account_traffic_unlimited');
        }

        const buttons = [];
        if (isTrial) {
          buttons.push([{ text: t(lang, 'btn_get_subscription'), callback_data: 'subscribe' }]);
        } else {
          buttons.push([{ text: t(lang, 'btn_renew_subscription'), callback_data: 'subscribe' }]);
          buttons.push([{ text: t(lang, 'btn_referral_bonus'), callback_data: 'referral' }]);
        }
        buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }]);

        await bot.editMessageText(text, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        });
      } else {
        // === Истёкшая подписка ===
        text += t(lang, 'account_status_expired') + '\n';
        text += t(lang, 'account_expired_cta');

        await bot.editMessageText(text, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_get_subscription'), callback_data: 'subscribe' }],
              [{ text: t(lang, 'btn_referral_bonus'), callback_data: 'referral' }],
              [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
            ],
          },
        });
      }

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка account:', err);
    }
  });
};

module.exports = setupAccountHandler;
