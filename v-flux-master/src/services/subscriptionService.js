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

  // Деактивируем старую подписку
  if (oldSub) {
    await oldSub.update({ active: false });
  }

  const subscription = await Subscription.create({
    user_id: userId,
    plan_id: planId,
    started_at: now,
    expires_at: expiresAt,
    traffic_limit: plan.traffic_limit_bytes,
    traffic_used: 0,
    throttled: false,
    active: true,
  });

  // Синк на ноды
  await syncUserOnAllNodes(user.uuid, Number(plan.traffic_limit_bytes));

  // Реферальный бонус (при первой оплате)
  await processReferralReward(userId);

  return subscription;
};

module.exports = { activateSubscription };
