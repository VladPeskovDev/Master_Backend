const express = require('express');
const { Payment, User, Subscription, Plan } = require('../../db/models');
const { verifyResult } = require('../services/robokassaService');
const { activateSubscription } = require('../services/subscriptionService');
const { syncUserOnAllNodes } = require('../services/nodeService');
const { processReferralReward } = require('../services/referralService');
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

    // Идемпотентность
    if (payment.status === 'paid') {
      return res.send(`OK${InvId}`);
    }

    let subscription;

    if (payment.provider_id?.startsWith('promo_') || (payment.method === 'visa' && payment.provider_id?.startsWith('visa_'))) {
      // Спецплан Visa/MC — кастомные дни и трафик
      const parts = payment.provider_id.split('_'); // visa_90_3
      const customDays = parseInt(parts[1], 10);
      const trafficMultiplier = parseInt(parts[2], 10);

      const plan = await Plan.findOne({ where: { name: 'Monthly', active: true } });
      const trafficPerMonth = plan ? Number(plan.traffic_limit_bytes) : 161061273600;

      const user = await User.findByPk(payment.user_id);
      if (!user) return res.send(`OK${InvId}`);

      // Деактивируем старую подписку
      const oldSub = await Subscription.findOne({ where: { user_id: payment.user_id, active: true } });
      const now = new Date();
      const baseDate = oldSub && new Date(oldSub.expires_at) > now
        ? new Date(oldSub.expires_at).getTime()
        : now.getTime();

      if (oldSub) await oldSub.update({ active: false });

      subscription = await Subscription.create({
        user_id: payment.user_id,
        plan_id: plan?.id || payment.plan_id,
        started_at: now,
        expires_at: new Date(baseDate + customDays * 24 * 60 * 60 * 1000),
        traffic_limit: trafficPerMonth * trafficMultiplier,
        traffic_used: 0,
        throttled: false,
        active: true,
      });

      await payment.update({ status: 'paid', provider_id: String(InvId) });
      await syncUserOnAllNodes(user.uuid, trafficPerMonth * trafficMultiplier);
      await processReferralReward(payment.user_id);
    } else {
      // Стандартная активация (МИР и прочие)
      await payment.update({ status: 'paid', provider_id: String(InvId) });
      subscription = await activateSubscription(payment.user_id, payment.plan_id);
    }

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
