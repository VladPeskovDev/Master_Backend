const express = require('express');
const { Payment, User } = require('../../db/models');
const { verifyWebhookSignature } = require('../services/cryptoPayService');
const { activateSubscription } = require('../services/subscriptionService');
const bot = require('../bot');
const { t } = require('../locales');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const signature = req.headers['crypto-pay-api-signature'];
    if (!signature || !verifyWebhookSignature(req.body, signature)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const update = req.body;
    if (update.update_type !== 'invoice_paid') {
      return res.sendStatus(200);
    }

    const invoice = update.payload;
    const invoiceId = String(invoice.invoice_id);

    let payloadData;
    try {
      payloadData = JSON.parse(invoice.payload || '{}');
    } catch {
      console.error('❌ CryptoPay webhook: invalid JSON in payload:', invoice.payload);
      return res.sendStatus(200);
    }

    const userId = Number(payloadData.user_id);
    const planId = Number(payloadData.plan_id);

    if (!userId || !planId || isNaN(userId) || isNaN(planId)) {
      console.error('❌ CryptoPay webhook: invalid userId or planId:', payloadData);
      return res.sendStatus(200);
    }

    // Идемпотентность: проверяем по provider_id
    const existingPayment = await Payment.findOne({ where: { provider_id: invoiceId } });
    if (existingPayment && existingPayment.status === 'paid') {
      return res.sendStatus(200);
    }

    // Обновляем или создаём Payment
    if (existingPayment) {
      await existingPayment.update({ status: 'paid' });
    } else {
      await Payment.create({
        user_id: userId,
        plan_id: planId,
        amount: Math.round(parseFloat(invoice.amount) * 100),
        currency: 'USD',
        method: 'crypto',
        provider_id: invoiceId,
        status: 'paid',
      });
    }

    // Активируем подписку
    const subscription = await activateSubscription(userId, planId);

    // Уведомляем юзера
    const user = await User.findByPk(userId);
    if (user) {
      const lang = user.lang || 'en';
      const text = t(lang, 'payment_success', { days: subscription.expires_at ? Math.round((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : '' });

      await bot.sendMessage(user.telegram_id, text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_connect'), callback_data: 'connect' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ CryptoPay webhook error:', err);
    res.sendStatus(200); // Возвращаем 200 чтобы CryptoPay не ретраил
  }
});

module.exports = router;
