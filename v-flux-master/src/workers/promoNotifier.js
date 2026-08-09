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
    console.log(`🔥 [${new Date().toISOString()}] Промо-рассылка T1 (3 месяца 199₽, трафик x3) стартовала`);
    const users = await fetchSegmentT1();
    console.log(`🔥 Промо T1: найдено ${users.length} юзеров в сегменте (lang=ru, брали триал, не платили, нет активной подписки)`);
    if (users.length === 0) {
      console.log('🔥 Промо T1: сегмент пуст — рассылка не запускается');
      return;
    }
    const r = await sendBroadcast(users, PROMO_T1, 'T1');
    console.log(`🔥 ИТОГО: отправлено ${r.sent}, заблокировали ${r.blocked}, ошибки ${r.errors}`);
  } catch (err) {
    console.error('❌ Promo notifier error:', err);
  }
};

// Cron с явной таймзоной MSK
const startPromoNotifier = () => {
  const cronExpr = '00 11 21 7 *'; // 19.07.2026 21:30 МСК — ОБНОВИ ДАТУ, эта уже прошла
  cron.schedule(cronExpr, runPromoNotifier, { timezone: 'Europe/Moscow' });
  console.log(`🔥 Промо T1 запланирована: cron='${cronExpr}' (Europe/Moscow). Сейчас на сервере: ${new Date().toISOString()} (UTC)`);
};

module.exports = { startPromoNotifier, runPromoNotifier, PROMO_T1 };
