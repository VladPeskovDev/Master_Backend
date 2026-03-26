const express = require('express');
const { Payment, User } = require('../../db/models');
const { verifySignature } = require('../services/oxaPayService');
const { activateSubscription } = require('../services/subscriptionService');
const bot = require('../bot');
const { t } = require('../locales');

const router = express.Router();

// Webhook — OxaPay стучит сюда при изменении статуса
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['hmac'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!signature || !verifySignature(rawBody, signature)) {
      console.error('❌ OxaPay webhook: invalid signature');
      return res.status(403).send('Invalid signature');
    }

    const data = req.body;

    // Только Paid
    if (data.status !== 'Paid') {
      return res.send('ok');
    }

    const orderId = data.order_id;
    if (!orderId) {
      console.error('❌ OxaPay webhook: missing order_id');
      return res.send('ok');
    }

    // order_id = "pay_123"
    const paymentId = orderId.replace('pay_', '');
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      console.error('❌ OxaPay webhook: payment not found for order_id:', orderId);
      return res.send('ok');
    }

    // Идемпотентность
    if (payment.status === 'paid') {
      return res.send('ok');
    }

    // Обновляем Payment
    await payment.update({ status: 'paid', provider_id: String(data.track_id) });

    // Активируем подписку
    const subscription = await activateSubscription(payment.user_id, payment.plan_id);

    // Уведомляем юзера
    const user = await User.findByPk(payment.user_id);
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

    console.log(`✅ OxaPay: подписка активирована для user ${payment.user_id}, plan ${payment.plan_id}`);
    res.send('ok');
  } catch (err) {
    console.error('❌ OxaPay webhook error:', err);
    res.send('ok');
  }
});

router.get('/success', (req, res) => {
  res.send('✅ Оплата успешна! Вернитесь в Telegram — подписка активируется автоматически.');
});

module.exports = router;
