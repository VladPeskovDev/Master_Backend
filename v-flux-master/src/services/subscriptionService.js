const { User, Plan, Subscription } = require('../../db/models');
const { syncUserOnAllNodes } = require('./nodeService');
const { processReferralReward } = require('./referralService');

const activateSubscription = async (userId, planId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error(`User ${userId} not found`);

  const plan = await Plan.findByPk(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  // Деактивируем старую подписку
  await Subscription.update(
    { active: false },
    { where: { user_id: userId, active: true } },
  );

  // Создаём новую подписку
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

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
