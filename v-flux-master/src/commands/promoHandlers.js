const { User, Plan, Payment } = require('../../db/models');
const { createOrder } = require('../services/rioPayService');

// Конфиг промо-офферов: amount, дни подписки, mult — множитель трафика от Monthly.
// mult = 0 → безлимит (webhook подставит Number.MAX_SAFE_INTEGER)
const PROMO_OFFERS = {
  promo_t1_3m_199: { amount: 199, days: 90, mult: 3, label: '3 месяца по цене месяца (акция)' },
};

const createPromoPayment = async (bot, query, offer) => {
  const user = await User.findOne({ where: { telegram_id: query.from.id } });
  if (!user) return;

  // Monthly как базовый план; webhook посчитает traffic от offer.mult
  const monthlyPlan = await Plan.findOne({ where: { name: 'Monthly', active: true } });
  if (!monthlyPlan) {
    await bot.answerCallbackQuery(query.id, { text: 'Plan not found', show_alert: true });
    return;
  }

  const payment = await Payment.create({
    user_id: user.id,
    plan_id: monthlyPlan.id,
    amount: offer.amount,
    currency: 'RUB',
    method: 'card',
    status: 'pending',
  });

  // Формат provider_id парсится rioPayWebhook: promo_<days>_<mult>_<paymentId>
  await payment.update({ provider_id: `promo_${offer.days}_${offer.mult}_${payment.id}` });

  const result = await createOrder({
    amount: offer.amount,
    currency: 'RUB',
    externalId: `pay_${payment.id}`,
    externalUserId: `user_${user.id}`,
    purpose: `Rocky VPN — ${offer.label}`,
  });

  await bot.sendMessage(
    query.message.chat.id,
    `💳 <b>${offer.label}</b>\n\nК оплате: <b>${offer.amount} ₽</b>\n\nПосле оплаты подписка активируется в течение пары минут.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Перейти к оплате', url: result.paymentLink }],
        ],
      },
    },
  );

  await bot.answerCallbackQuery(query.id);
};

const setupPromoHandlers = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      const offer = PROMO_OFFERS[query.data];
      if (!offer) return;
      await createPromoPayment(bot, query, offer);
    } catch (err) {
      console.error(`❌ Promo handler (${query.data}):`, err);
      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'Ошибка оплаты. Попробуйте позже.',
          show_alert: true,
        });
      } catch {}
    }
  });
};

module.exports = setupPromoHandlers;
