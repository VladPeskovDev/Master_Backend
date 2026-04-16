const express = require('express');
const { Payment, User, Subscription, Plan } = require('../../db/models');
const { verifySignature, isAllowedIp } = require('../services/rioPayService');
const { activateSubscription } = require('../services/subscriptionService');
const { syncUserOnAllNodes } = require('../services/nodeService');
const { processReferralReward } = require('../services/referralService');
const bot = require('../bot');
const { t } = require('../locales');

const router = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    // 1. IP whitelist
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (!isAllowedIp(ip)) {
      console.error(`❌ RioPay webhook: blocked IP ${ip}`);
      return res.status(403).send('Forbidden');
    }

    // 2. Проверка подписи (если есть)
    const signature = req.headers['x-signature'];
    if (signature) {
      const body = req.rawBody || JSON.stringify(req.body);
      if (!verifySignature(body, signature)) {
        console.error('❌ RioPay webhook: invalid signature');
        return res.status(403).send('Invalid signature');
      }
    }

    const data = req.body;

    // 3. Только COMPLETED
    if (data.status !== 'COMPLETED') {
      return res.sendStatus(200);
    }

    if (!data.externalId) {
      console.error('❌ RioPay webhook: missing externalId');
      return res.sendStatus(200);
    }

    // 4. Находим Payment по externalId (формат: pay_123)
    const paymentId = data.externalId.replace('pay_', '');
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      console.error('❌ RioPay webhook: payment not found for externalId:', data.externalId);
      return res.sendStatus(200);
    }

    // 5. Идемпотентность
    if (payment.status === 'paid') {
      return res.sendStatus(200);
    }

    // 6. Активируем подписку
    let subscription;

    if (payment.provider_id?.startsWith('promo_')) {
      // Промо-акция — кастомные дни и трафик
      const parts = payment.provider_id.split('_'); // promo_60_2_42
      const customDays = parseInt(parts[1], 10);
      const trafficMultiplier = parseInt(parts[2], 10);
      const plan = await Plan.findByPk(payment.plan_id);
      const traffic = plan ? Number(plan.traffic_limit_bytes) * trafficMultiplier : 161061273600 * 2;

      const oldSub = await Subscription.findOne({ where: { user_id: payment.user_id, active: true } });
      const now = new Date();
      const baseDate = oldSub && new Date(oldSub.expires_at) > now ? new Date(oldSub.expires_at).getTime() : now.getTime();
      if (oldSub) await oldSub.update({ active: false });

      await payment.update({ status: 'paid', provider_id: data.id });
      subscription = await Subscription.create({
        user_id: payment.user_id, plan_id: payment.plan_id, started_at: now,
        expires_at: new Date(baseDate + customDays * 24 * 60 * 60 * 1000),
        traffic_limit: traffic, traffic_used: 0, throttled: false, active: true,
      });

      const promoUser = await User.findByPk(payment.user_id);
      if (promoUser) await syncUserOnAllNodes(promoUser.uuid, traffic);
      await processReferralReward(payment.user_id);
    } else {
      // Стандартная активация
      await payment.update({ status: 'paid', provider_id: data.id });
      subscription = await activateSubscription(payment.user_id, payment.plan_id);
    }

    // 7. Уведомляем юзера
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

    console.log(`✅ RioPay: подписка активирована для user ${payment.user_id}, plan ${payment.plan_id}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ RioPay webhook error:', err);
    res.sendStatus(200);
  }
});

router.get('/success', (req, res) => {
  res.send('✅ Оплата успешна! Вернитесь в Telegram — подписка активируется в течение пары минут.');
});

router.get('/fail', (req, res) => {
  res.send('❌ Оплата не прошла. Вернитесь в Telegram и попробуйте снова.');
});

module.exports = router;
