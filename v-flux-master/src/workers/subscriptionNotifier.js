const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, User, Plan, Payment } = require('../../db/models');
const bot = require('../bot');
const { t } = require('../locales');
const { PROMO_T1 } = require('./promoNotifier');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Триальщик подходит под промо T1: ru + ни одной оплаты в истории
const isPromoEligible = async (user) => {
  if (user.lang !== 'ru') return false;
  const paid = await Payment.count({ where: { user_id: user.id, status: 'paid' } });
  return paid === 0;
};

const runSubscriptionNotifier = async () => {
  try {
    const now = new Date();

    // "Завтра" — от начала завтрашнего дня до конца завтрашнего дня
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // "Вчера" — от начала вчерашнего дня до конца вчерашнего дня
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // 1. Подписки, истекающие завтра (ещё активные)
    const expiring = await Subscription.findAll({
      where: {
        active: true,
        expires_at: { [Op.between]: [tomorrowStart, tomorrowEnd] },
      },
      include: [{ model: User }, { model: Plan }],
    });

    // 2. Подписки, истёкшие вчера (уже неактивные)
    const expiredAll = await Subscription.findAll({
      where: {
        active: false,
        expires_at: { [Op.between]: [yesterdayStart, yesterdayEnd] },
      },
      include: [{ model: User }, { model: Plan }],
    });

    // Фильтр: не слать если юзер уже купил новую подписку
    const expired = [];
    for (const sub of expiredAll) {
      const hasActive = await Subscription.findOne({
        where: { user_id: sub.user_id, active: true },
      });
      if (!hasActive) expired.push(sub);
    }

    console.log(`📬 Уведомления: ${expiring.length} истекают завтра, ${expired.length} истекли вчера`);

    const makeKeyboard = (lang) => ({
      inline_keyboard: [
        [{ text: t(lang, 'btn_renew_subscription'), callback_data: 'notify_subscribe' }],
        [{ text: t(lang, 'btn_referral_bonus'), callback_data: 'notify_referral' }],
      ],
    });

    // Отправляет либо промо T1, либо стандартный текст.
    // Триалу, попавшему под промо → PROMO_T1.
    // Триалу без промо (не-ru или уже платил) → пропускаем.
    // Не-триалу → стандартное уведомление.
    const sendNotify = async (sub, standardKey, tag) => {
      const isTrial = sub.Plan?.is_trial === true;
      const lang = sub.User.lang || 'en';

      try {
        if (isTrial) {
          const eligible = await isPromoEligible(sub.User);
          if (!eligible) return { skipped: true };
          await bot.sendMessage(sub.User.telegram_id, PROMO_T1.text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: PROMO_T1.keyboard },
          });
          return { promo: true };
        }

        await bot.sendMessage(sub.User.telegram_id, t(lang, standardKey), {
          parse_mode: 'HTML',
          reply_markup: makeKeyboard(lang),
        });
        return { standard: true };
      } catch (err) {
        if (err?.response?.statusCode === 403) return { blocked: true };
        console.error(`❌ Notify ${tag} error (${sub.User.telegram_id}):`, err.message);
        return { error: true };
      }
    };

    let promoSent = 0;
    let standardSent = 0;
    let skipped = 0;

    // "Истекает завтра"
    for (const sub of expiring) {
      const r = await sendNotify(sub, 'notify_expiring', 'expiring');
      if (r.promo) promoSent++;
      else if (r.standard) standardSent++;
      else if (r.skipped) skipped++;
      await sleep(50);
    }

    // "Истёк вчера"
    for (const sub of expired) {
      const r = await sendNotify(sub, 'notify_expired', 'expired');
      if (r.promo) promoSent++;
      else if (r.standard) standardSent++;
      else if (r.skipped) skipped++;
      await sleep(50);
    }

    console.log(`📬 Итог: промо ${promoSent}, стандарт ${standardSent}, пропущено ${skipped}`);
  } catch (err) {
    console.error('❌ Subscription notifier error:', err);
  }
};

const startSubscriptionNotifier = () => {
  cron.schedule('30 10 * * *', runSubscriptionNotifier);
  console.log('📬 Subscription notifier запущен (ежедневно в 10:30 UTC)');
};

module.exports = { startSubscriptionNotifier, runSubscriptionNotifier };
