const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const { User } = require('../../db/models');
const bot = require('../bot');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// === Текст акции: T1 — юзеры, которые брали триал, но не купили платку ===
const PROMO_T1 = {
  text:
    '🔥🔥🔥 <b>СПЕЦПРЕДЛОЖЕНИЕ ТОЛЬКО ДЛЯ ВАС</b> 🔥🔥🔥\n\n'
    + '💎 <b>3 месяца Rocky VPN — 199 ₽</b>\n'
    + '<i>(по цене одного месяца — экономия 66%)</i>\n\n'
    + '⚡️ <b>Что внутри:</b>\n'
    + '📱 Безлимит устройств — телефон, ноут, планшет\n'
    + '🚀 Новые быстрые сервера\n'
    + '🛡 Минимальный шанс блокировки — свежие IP\n'
    + '🔐 Без логов, без рекламы\n'
    + '🌍 YouTube, Instagram, ChatGPT — всё летает\n\n'
    + '🎯 Оплата картой РФ, подписка активируется автоматически.\n\n'
    + '⏰ <b>Акция ограничена — заберите сейчас!</b>',
  keyboard: [
    [{ text: '🔥 Забрать 3 месяца за 199 ₽', callback_data: 'promo_t1_3m_199' }],
  ],
};

// === Текст акции: C2 — платники (истёкшие + активные месячные) ===
const PROMO_C2 = {
  text:
    '🔥🔥🔥 <b>СПЕЦПРЕДЛОЖЕНИЕ ТОЛЬКО ДЛЯ СВОИХ</b> 🔥🔥🔥\n\n'
    + '💎 <b>Полгода Rocky VPN — 399 ₽</b>\n'
    + '<i>(66 ₽ в месяц — экономия 67%)</i>\n\n'
    + '⚡️ <b>Что внутри:</b>\n'
    + '📱 Безлимит устройств — телефон, ноут, планшет\n'
    + '🚀 Новые быстрые сервера\n'
    + '🛡 Минимальный шанс блокировки — свежие IP\n'
    + '🔐 Без логов, без рекламы\n'
    + '🌍 YouTube, Instagram, ChatGPT — всё летает\n\n'
    + '🎯 Оплата картой РФ, подписка активируется автоматически.\n\n'
    + '⏰ <b>Только для наших юзеров — акция ограничена!</b>',
  keyboard: [
    [{ text: '🔥 Забрать 6 месяцев за 399 ₽', callback_data: 'promo_c2_6m_399' }],
  ],
};

// T1 — брали триал (была Subscription с trial-планом), никогда не платили,
// сейчас без активной подписки, lang='ru'
const fetchSegmentT1 = async () => User.findAll({
  where: {
    lang: 'ru',
    [Op.and]: [
      { id: { [Op.in]: literal('(SELECT DISTINCT s.user_id FROM "Subscriptions" s JOIN "Plans" p ON p.id = s.plan_id WHERE p.is_trial = true)') } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Payments" WHERE status = \'paid\')') } },
      { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions" WHERE active = true)') } },
    ],
  },
});

// C2 — платили хотя бы раз + либо без активной подписки, либо активный Monthly (не триал), lang='ru'
const fetchSegmentC2 = async () => User.findAll({
  where: {
    lang: 'ru',
    [Op.and]: [
      { id: { [Op.in]: literal('(SELECT DISTINCT user_id FROM "Payments" WHERE status = \'paid\')') } },
      {
        [Op.or]: [
          { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions" WHERE active = true)') } },
          { id: { [Op.in]: literal('(SELECT DISTINCT s.user_id FROM "Subscriptions" s JOIN "Plans" p ON p.id = s.plan_id WHERE s.active = true AND p.is_trial = false AND p.name = \'Monthly\')') } },
        ],
      },
    ],
  },
});

// Рассылка с защитой от TG rate-limit (429) и обработкой блокировок (403)
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
    console.log(`🔥 [${new Date().toISOString()}] Промо-рассылка C2 (полгода 399₽, трафик x6) стартовала`);
    const users = await fetchSegmentC2();
    console.log(`🔥 Промо C2: найдено ${users.length} юзеров (lang=ru, платили ранее, либо без активной подписки, либо активный Monthly)`);
    if (users.length === 0) {
      console.log('🔥 Промо C2: сегмент пуст — рассылка не запускается');
      return;
    }
    const r = await sendBroadcast(users, PROMO_C2, 'C2');
    console.log(`🔥 ИТОГО: отправлено ${r.sent}, заблокировали ${r.blocked}, ошибки ${r.errors}`);
  } catch (err) {
    console.error('❌ Promo notifier error:', err);
  }
};

// Cron с явной таймзоной MSK
const startPromoNotifier = () => {
  const cronExpr = '0 18 9 8 *'; // 09.08 18:00 МСК
  cron.schedule(cronExpr, runPromoNotifier, { timezone: 'Europe/Moscow' });
  console.log(`🔥 Промо C2 запланирована: cron='${cronExpr}' (Europe/Moscow). Сейчас на сервере: ${new Date().toISOString()} (UTC)`);
};

module.exports = { startPromoNotifier, runPromoNotifier, PROMO_T1, PROMO_C2 };
