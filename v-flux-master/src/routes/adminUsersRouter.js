const express = require('express');
const { User, Subscription, Plan, Payment } = require('../../db/models');
const { removeUserFromAllNodes, addUserToAllNodes } = require('../services/nodeService');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/users — список юзеров
router.get('/', async (req, res) => {
  try {
    const users = await User.findAll({
      include: [{
        model: Subscription,
        where: { active: true },
        required: false,
        include: [{ model: Plan }],
      }],
      order: [['id', 'ASC']],
    });

    const result = users.map((u) => ({
      id: u.id,
      telegram_id: u.telegram_id,
      username: u.username,
      first_name: u.first_name,
      lang: u.lang,
      region: u.region,
      plan: u.Subscriptions?.[0]?.Plan?.name || null,
      active: u.Subscriptions?.length > 0,
      expires_at: u.Subscriptions?.[0]?.expires_at || null,
    }));

    res.json({ users: result, total: result.length });
  } catch (err) {
    console.error('❌ Admin users list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users/:id — детали юзера
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Subscription, include: [{ model: Plan }] },
        { model: Payment },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('❌ Admin user detail:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id — удалить юзера + снять с нод
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Снимаем с нод
    await removeUserFromAllNodes(user.uuid);

    // Деактивируем подписки
    await Subscription.update(
      { active: false },
      { where: { user_id: user.id } },
    );

    // Удаляем юзера
    await user.destroy();

    res.json({ message: `User ${user.telegram_id} deleted and removed from all nodes` });
  } catch (err) {
    console.error('❌ Admin user delete:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/subscription — выдать подписку вручную
router.post('/:id/subscription', async (req, res) => {
  try {
    const { plan_id, days } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const plan = await Plan.findByPk(plan_id);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const durationDays = days || plan.duration_days;

    // Деактивируем старые подписки
    await Subscription.update(
      { active: false },
      { where: { user_id: user.id, active: true } },
    );

    // Создаём новую
    const sub = await Subscription.create({
      user_id: user.id,
      plan_id: plan.id,
      started_at: new Date(),
      expires_at: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      traffic_limit: plan.traffic_limit_bytes,
      traffic_used: 0,
      throttled: false,
      active: true,
    });

    // Добавляем на ноды
    await addUserToAllNodes(user.uuid, Number(plan.traffic_limit_bytes));

    res.status(201).json({ subscription: sub });
  } catch (err) {
    console.error('❌ Admin grant sub:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;