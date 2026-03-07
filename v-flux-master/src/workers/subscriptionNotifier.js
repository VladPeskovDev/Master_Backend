const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, User } = require('../../db/models');
const bot = require('../bot');
const { t } = require('../locales');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    yesterdayEnd.setDate(yesterdayStart.getDate());
    yesterdayEnd.setHours(23, 59, 59, 999);

    // 1. Подписки, истекающие завтра (ещё активные)
    const expiring = await Subscription.findAll({
      where: {
        active: true,
        expires_at: { [Op.between]: [tomorrowStart, tomorrowEnd] },
      },
      include: [{ model: User }],
    });

    // 2. Подписки, истёкшие вчера (уже неактивные)
    const expired = await Subscription.findAll({
      where: {
        active: false,
        expires_at: { [Op.between]: [yesterdayStart, yesterdayEnd] },
      },
      include: [{ model: User }],
    });

    console.log(`📬 Уведомления: ${expiring.length} истекают завтра, ${expired.length} истекли вчера`);

    const makeKeyboard = (lang) => ({
      inline_keyboard: [
        [{ text: t(lang, 'btn_renew_subscription'), callback_data: 'subscribe' }],
        [{ text: t(lang, 'btn_referral_bonus'), callback_data: 'referral' }],
      ],
    });

    // Отправляем "истекает завтра"
    for (const sub of expiring) {
      try {
        const lang = sub.User.lang || 'en';
        await bot.sendMessage(sub.User.telegram_id, t(lang, 'notify_expiring'), {
          parse_mode: 'HTML',
          reply_markup: makeKeyboard(lang),
        });
      } catch (err) {
        if (err?.response?.statusCode === 403) continue; // бот заблокирован
        console.error(`❌ Notify expiring error (${sub.User.telegram_id}):`, err.message);
      }
      await sleep(50);
    }

    // Отправляем "подписка истекла"
    for (const sub of expired) {
      try {
        const lang = sub.User.lang || 'en';
        await bot.sendMessage(sub.User.telegram_id, t(lang, 'notify_expired'), {
          parse_mode: 'HTML',
          reply_markup: makeKeyboard(lang),
        });
      } catch (err) {
        if (err?.response?.statusCode === 403) continue;
        console.error(`❌ Notify expired error (${sub.User.telegram_id}):`, err.message);
      }
      await sleep(50);
    }
  } catch (err) {
    console.error('❌ Subscription notifier error:', err);
  }
};

const startSubscriptionNotifier = () => {
  cron.schedule('0 10 * * *', runSubscriptionNotifier);
  console.log('📬 Subscription notifier запущен (ежедневно в 10:00 UTC)');
};

module.exports = { startSubscriptionNotifier, runSubscriptionNotifier };
