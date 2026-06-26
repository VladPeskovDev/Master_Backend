const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const { User } = require('../../db/models');
const bot = require('../bot');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// === Тексты и кнопки промо-рассылки (только ru) ===
const PROMO = {
  c1: {
    text:
      '🔓 <b>Ваш доступ на паузе.</b>\n\n'
      + 'Понравилась скорость? Верните Rocky VPN — и больше не упирайтесь в лимит.\n\n'
      + '<b>Полгода за 499 ₽</b> вместо 599 (по 83 ₽/мес).\n'
      + '⏰ Только 48 часов.',
    keyboard: [
      [{ text: '🔥 Забрать полгода за 499 ₽', callback_data: 'promo_c1_semi' }],
    ],
  },
  c2: {
    text:
      '👋 <b>Скучали?</b>\n\n'
      + 'Ваша подписка закончилась давно. За это время мы добавили ноды и ускорили подключение.\n\n'
      + 'Вернитесь — старый ключ оживёт сразу:\n'
      + '💳 первый месяц — <b>149 ₽</b>\n'
      + '🔥 полгода — <b>499 ₽</b>\n\n'
      + '⏰ Только 48 часов.',
    keyboard: [
      [{ text: '💳 Месяц за 149 ₽', callback_data: 'promo_c2_month' }],
      [{ text: '🔥 Полгода за 499 ₽', callback_data: 'promo_c2_semi' }],
    ],
  },
  c3: {
    text:
      '🎁 <b>Вы заглянули, но так и не попробовали.</b>\n\n'
      + 'Заберите бесплатный доступ — без оплаты, прямо сейчас.\n\n'
      + 'Скорость 1 Гбит/с, без логов. Настройка за минуту.',
    keyboard: [
      [{ text: '🎁 Получить бесплатный доступ', callback_data: 'connect' }],
    ],
  },
};

// === Выборки сегментов (все с lang='ru') ===

// С2 — бывшие платящие без активной подписки
const fetchSegmentC2 = async () => User.findAll({
  where: {
    lang: 'ru',
    [Op.and]: [
      { id: { [Op.in]: literal('(SELECT DISTINCT user_id FROM "Payments" WHERE status = \'paid\')') } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions" WHERE active = true)') } },
    ],
  },
});

// С1 — истёкший триал, не платили, нет активной
const fetchSegmentC1 = async () => User.findAll({
  where: {
    lang: 'ru',
    [Op.and]: [
      { id: { [Op.in]: literal(`(
        SELECT DISTINCT s.user_id FROM "Subscriptions" s
        JOIN "Plans" p ON p.id = s.plan_id
        WHERE p.is_trial = true AND s.active = false
      )`) } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions" WHERE active = true)') } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Payments" WHERE status = \'paid\')') } },
    ],
  },
});

// С3 — нет ни одной подписки и не платили
const fetchSegmentC3 = async () => User.findAll({
  where: {
    lang: 'ru',
    [Op.and]: [
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions")') } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Payments" WHERE status = \'paid\')') } },
    ],
  },
});

// === Рассылка одного сегмента с защитой от лимитов TG ===
const sendBroadcast = async (users, content, segmentName) => {
  console.log(`🔥 Промо ${segmentName}: ${users.length} юзеров для рассылки`);

  let sent = 0;
  let blocked = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    let done = false;

    while (!done) {
      try {
        await bot.sendMessage(user.telegram_id, content.text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: content.keyboard },
        });
        sent++;
        done = true;
      } catch (err) {
        const code = err?.response?.statusCode || err?.code;
        if (code === 403) {
          blocked++;
          done = true;
        } else if (code === 429) {
          const retryAfter = err?.response?.body?.parameters?.retry_after
            || err?.response?.parameters?.retry_after
            || 5;
          console.warn(`⏳ ${segmentName}: TG rate-limit, ждём ${retryAfter}s`);
          await sleep(retryAfter * 1000);
        } else {
          errors++;
          console.error(`❌ Промо ${segmentName} ${user.telegram_id}:`, err.message);
          done = true;
        }
      }
    }

    await sleep(50);
    if ((i + 1) % 100 === 0) await sleep(1000);
  }

  console.log(`🔥 Промо ${segmentName}: отправлено ${sent}/${users.length} ✓  заблокировали ${blocked}  ошибки ${errors}`);
  return { sent, blocked, errors };
};

const runPromoNotifier = async () => {
  try {
    console.log('🔥 Промо-рассылка стартовала');

    const c2Users = await fetchSegmentC2();
    const r2 = await sendBroadcast(c2Users, PROMO.c2, 'С2 (бывшие платящие)');

    await sleep(2000);

    const c1Users = await fetchSegmentC1();
    const r1 = await sendBroadcast(c1Users, PROMO.c1, 'С1 (триал истёк)');

    await sleep(2000);

    const c3Users = await fetchSegmentC3();
    const r3 = await sendBroadcast(c3Users, PROMO.c3, 'С3 (нет триала)');

    const totalSent = r1.sent + r2.sent + r3.sent;
    const totalBlocked = r1.blocked + r2.blocked + r3.blocked;
    const totalErrors = r1.errors + r2.errors + r3.errors;
    console.log(`🔥 ИТОГО: отправлено ${totalSent}, заблокировали ${totalBlocked}, ошибки ${totalErrors}`);
  } catch (err) {
    console.error('❌ Promo notifier error:', err);
  }
};

// Разовый запуск: 14 июня 2026, 13:00 UTC (16:00 МСК) — акция завершена, cron отключён
const startPromoNotifier = () => {
  // cron.schedule('0 13 14 6 *', runPromoNotifier);
  // console.log('🔥 Промо рассылка запланирована: 14.06.2026 16:00 МСК');
};

module.exports = { startPromoNotifier, runPromoNotifier };
