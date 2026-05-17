const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, User, Plan } = require('../../db/models');
const bot = require('../bot');
const { t } = require('../locales');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const runPromoNotifier = async () => {
  try {
    // Все юзеры с истёкшим триалом, lang=ru
    const expiredTrials = await Subscription.findAll({
      where: { active: false },
      include: [
        { model: Plan, where: { is_trial: true } },
        { model: User, where: { lang: 'ru' } },
      ],
    });

    // Фильтр: нет активной подписки
    const targets = [];
    for (const sub of expiredTrials) {
      const hasActive = await Subscription.findOne({
        where: { user_id: sub.user_id, active: true },
      });
      if (!hasActive && sub.User) targets.push(sub.User);
    }

    // Убираем дубли (юзер мог иметь несколько неактивных подписок)
    const seen = new Set();
    const unique = targets.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    console.log(`🔥 Промо: ${unique.length} юзеров для рассылки`);

    let sent = 0;
    for (const user of unique) {
      try {
        await bot.sendMessage(user.telegram_id, t('ru', 'promo_trial_expired'), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔥 Оплатить 150₽ за 2 месяца', callback_data: 'promo_trial_expired' }],
            ],
          },
        });
        sent++;
      } catch (err) {
        if (err?.response?.statusCode === 403) continue;
        console.error(`❌ Промо ${user.telegram_id}:`, err.message);
      }
      await sleep(50);
    }

    console.log(`🔥 Промо: отправлено ${sent}/${unique.length}`);
  } catch (err) {
    console.error('❌ Promo notifier error:', err);
  }
};

// Разовый запуск: 17 мая 2026, 15:02 UTC (18:02 МСК)
const startPromoNotifier = () => {
  cron.schedule('2 15 17 5 *', runPromoNotifier);
  console.log('🔥 Промо рассылка запланирована: 17.05.2026 18:02 МСК');
};

module.exports = { startPromoNotifier, runPromoNotifier };
