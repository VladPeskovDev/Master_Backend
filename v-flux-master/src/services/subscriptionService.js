const { User, Plan, Subscription } = require('../../db/models');
const { syncUserOnAllNodes } = require('./nodeService');
const { processReferralReward } = require('./referralService');

const activateSubscription = async (userId, planId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error(`User ${userId} not found`);

  const plan = await Plan.findByPk(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  // Ищем старую подписку — если есть остаток дней, приплюсуем
  const oldSub = await Subscription.findOne({
    where: { user_id: userId, active: true },
  });

  const now = new Date();
  const baseDate = oldSub && new Date(oldSub.expires_at) > now
    ? new Date(oldSub.expires_at).getTime()
    : now.getTime();
  const expiresAt = new Date(baseDate + plan.duration_days * 24 * 60 * 60 * 1000);

  // Считаем остаток трафика (если не замедлён и не превышен)
  let remainingTraffic = 0;
  if (oldSub && !oldSub.throttled) {
    const left = Number(oldSub.traffic_limit) - Number(oldSub.traffic_used);
    if (left > 0) remainingTraffic = left;
  }

  // Деактивируем старую подписку
  if (oldSub) {
    await oldSub.update({ active: false });
  }

  const subscription = await Subscription.create({
    user_id: userId,
    plan_id: planId,
    started_at: now,
    expires_at: expiresAt,
    traffic_limit: Number(plan.traffic_limit_bytes) + remainingTraffic,
    traffic_used: 0,
    throttled: false,
    active: true,
  });

  // Синк на ноды (план + остаток старого трафика)
  await syncUserOnAllNodes(user.uuid, Number(plan.traffic_limit_bytes) + remainingTraffic);

  // Реферальный бонус (при первой оплате)
  await processReferralReward(userId);

  return subscription;
};

module.exports = { activateSubscription };
