const express = require('express');
const { Payment, User } = require('../../db/models');
const { verifyWebhook } = require('../services/telegaPayService');
const { activateSubscription } = require('../services/subscriptionService');
const bot = require('../bot');
const { t } = require('../locales');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !verifyWebhook(apiKey)) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    const { transaction_id: transactionId, status, type } = req.body;

    // Только успешные входящие платежи
    if (type !== 'payin' || status !== 'completed') {
      return res.sendStatus(200);
    }

    if (!transactionId) {
      console.error('❌ TelegaPay webhook: missing transaction_id');
      return res.sendStatus(200);
    }

    // Идемпотентность: проверяем по provider_id
    const existingPayment = await Payment.findOne({ where: { provider_id: String(transactionId) } });
    if (existingPayment && existingPayment.status === 'paid') {
      return res.sendStatus(200);
    }

    if (!existingPayment) {
      console.error('❌ TelegaPay webhook: payment not found for transaction:', transactionId);
      return res.sendStatus(200);
    }

    // Обновляем Payment
    await existingPayment.update({ status: 'paid' });

    const userId = existingPayment.user_id;
    const planId = existingPayment.plan_id;

    // Активируем подписку
    const subscription = await activateSubscription(userId, planId);

    // Уведомляем юзера
    const user = await User.findByPk(userId);
    if (user) {
      const lang = user.lang || 'en';
      const days = subscription.expires_at
        ? Math.round((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
        : '';

      await bot.sendMessage(user.telegram_id, t(lang, 'payment_success', { days }), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_connect'), callback_data: 'connect' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });
    }

    console.log(`✅ TelegaPay: подписка активирована для user ${userId}, plan ${planId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ TelegaPay webhook error:', err);
    res.sendStatus(200);
  }
});

module.exports = router;
