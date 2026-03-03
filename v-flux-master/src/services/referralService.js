const { User, Subscription, Plan, ReferralReward } = require('../../db/models');
const { addUserToAllNodes, unthrottleOnAllNodes } = require('./nodeService');

/*
 * processReferralReward(userId)
 *
 * Вызывается после первой оплаты юзера.
 * Если юзер пришёл по реферальной ссылке — начисляем бонус рефереру.
 *
 * Логика:
 * 1. Юзер B оплатил подписку
 * 2. Проверяем: есть referred_by? → Юзер A (реферер)
 * 3. Награда уже была? (ReferralReward с referred_id = userId) → пропускаем
 * 4. У реферера есть активная подписка? → +30 дней + 100GB
 * 5. У реферера нет подписки? → создаём бесплатную на 30 дней
 * 6. Запись в ReferralRewards
 *
 * Бонус: 30 дней + 107374182400 bytes (100 GB)
 */

const REWARD_DAYS = 30;
const REWARD_TRAFFIC = 107374182400; // 100 GB

const processReferralReward = async (userId) => {
  try {
    // Находим юзера который оплатил
    const user = await User.findByPk(userId);
    if (!user || !user.referred_by) return null;

    // Проверяем — награда уже начислена?
    const existing = await ReferralReward.findOne({
      where: { referred_id: user.id },
    });
    if (existing) return null;

    // Находим реферера
    const referrer = await User.findByPk(user.referred_by);
    if (!referrer) return null;

    // Ищем активную подписку реферера
    let referrerSub = await Subscription.findOne({
      where: { user_id: referrer.id, active: true },
    });

    if (referrerSub) {
      // Есть подписка → +30 дней + 100GB
      const newExpires = new Date(referrerSub.expires_at);
      newExpires.setDate(newExpires.getDate() + REWARD_DAYS);

      const newTrafficLimit = Number(referrerSub.traffic_limit) + REWARD_TRAFFIC;

      await referrerSub.update({
        expires_at: newExpires,
        traffic_limit: newTrafficLimit,
      });

      // Если был throttled по трафику — возможно теперь лимит не превышен
      if (referrerSub.throttled && Number(referrerSub.traffic_used) < newTrafficLimit) {
        await unthrottleOnAllNodes(referrer.uuid);
        await referrerSub.update({ throttled: false });
      }

      console.log(`🎁 Реферал: ${referrer.uuid} получил +${REWARD_DAYS} дней, +100GB`);
    } else {
      // Нет подписки → создаём бесплатную на 30 дней
      const monthlyPlan = await Plan.findOne({
        where: { name: 'Monthly', active: true },
      });

      if (!monthlyPlan) return null;

      referrerSub = await Subscription.create({
        user_id: referrer.id,
        plan_id: monthlyPlan.id,
        started_at: new Date(),
        expires_at: new Date(Date.now() + REWARD_DAYS * 24 * 60 * 60 * 1000),
        traffic_limit: REWARD_TRAFFIC,
        traffic_used: 0,
        throttled: false,
        active: true,
      });

      // Добавляем на ноды
      await addUserToAllNodes(referrer.uuid, Number(REWARD_TRAFFIC));

      console.log(`🎁 Реферал: ${referrer.uuid} получил бесплатную подписку на ${REWARD_DAYS} дней`);
    }

    // Записываем награду
    await ReferralReward.create({
      referrer_id: referrer.id,
      referred_id: user.id,
      days_awarded: REWARD_DAYS,
      traffic_awarded: REWARD_TRAFFIC,
    });

    return { referrer_id: referrer.id, days: REWARD_DAYS, traffic: REWARD_TRAFFIC };
  } catch (err) {
    console.error('❌ Ошибка реферальной награды:', err);
    return null;
  }
};

module.exports = { processReferralReward };

/*
 * ============================================
 * ПРИНЦИП РАБОТЫ РЕФЕРАЛЬНОЙ СИСТЕМЫ
 * ============================================
 *
 * ПУТЬ ЮЗЕРА:
 * 1. Юзер A нажимает "Пригласить друга" → получает ссылку t.me/bot?start=ref_XXXXX
 * 2. Юзер B переходит по ссылке → /start записывает referred_by = A.id
 * 3. Юзер B получает триал 3 дня → пользуется
 * 4. Юзер B покупает подписку → webhook оплаты вызывает processReferralReward(B.id)
 * 5. Юзер A получает +30 дней и +100GB к своей подписке
 *
 * КЕЙСЫ:
 * - У реферера есть подписка → продлеваем + добавляем трафик
 * - У реферера нет подписки → создаём бесплатную на 30 дней с 100GB
 * - Реферер был throttled → если новый лимит покрывает трафик → unthrottle
 * - Награда уже была → пропускаем (referred_id unique)
 * - referred_by null → пропускаем (юзер пришёл не по ссылке)
 *
 * ПОДКЛЮЧЕНИЕ:
 * На этапе 7 (оплата) в webhook после создания подписки:
 *   const { processReferralReward } = require('../services/referralService');
 *   await processReferralReward(user.id);
 *
 * ============================================
 */