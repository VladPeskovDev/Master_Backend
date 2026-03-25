const express = require('express');
const { Payment, User } = require('../../db/models');
const { verifyResult } = require('../services/robokassaService');
const { activateSubscription } = require('../services/subscriptionService');
const bot = require('../bot');
const { t } = require('../locales');

const router = express.Router();

// ResultURL — Робокасса стучит сюда после успешной оплаты
router.post('/result', async (req, res) => {
  try {
    const { OutSum, InvId, SignatureValue, ...rest } = req.body;

    // Собираем Shp_ параметры
    const shpParams = {};
    Object.keys(rest).forEach((key) => {
      if (key.startsWith('Shp_')) shpParams[key] = rest[key];
    });

    // Проверяем подпись
    if (!verifyResult({ OutSum, InvId, SignatureValue, shpParams })) {
      console.error('❌ Robokassa: invalid signature');
      return res.status(400).send('bad sign');
    }

    const invoiceId = Number(InvId);
    const payment = await Payment.findByPk(invoiceId);

    if (!payment) {
      console.error('❌ Robokassa: payment not found, InvId:', invoiceId);
      return res.status(404).send('payment not found');
    }

    // Проверка суммы
    const roboSum = parseFloat(OutSum);
    const localSum = parseFloat(payment.amount);
    if (Math.abs(roboSum - localSum) > 0.01) {
      console.error('❌ Robokassa: amount mismatch, local:', localSum, 'robo:', roboSum);
      return res.status(400).send('bad amount');
    }

    // Идемпотентность
    if (payment.status === 'paid') {
      return res.send(`OK${InvId}`);
    }

    // Обновляем Payment
    await payment.update({ status: 'paid', provider_id: String(InvId) });

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

    console.log(`✅ Robokassa: подписка активирована для user ${payment.user_id}, plan ${payment.plan_id}`);
    return res.send(`OK${InvId}`);
  } catch (err) {
    console.error('❌ Robokassa result error:', err);
    return res.status(500).send('error');
  }
});

router.get('/success', (req, res) => {
  res.send('✅ Оплата успешна! Вернитесь в Telegram — подписка активируется автоматически.');
});

router.get('/fail', (req, res) => {
  res.send('❌ Оплата не прошла. Вернитесь в Telegram и попробуйте снова.');
});

module.exports = router;
