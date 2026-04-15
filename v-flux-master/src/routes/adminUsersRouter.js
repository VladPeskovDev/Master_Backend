const express = require('express');
const { Op, literal } = require('sequelize');
const { User, Subscription, Plan, Payment } = require('../../db/models');
const { removeUserFromAllNodes, syncUserOnAllNodes, throttleOnAllNodes, unthrottleOnAllNodes } = require('../services/nodeService');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/users/paid — платные подписки с пагинацией
router.get('/paid', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { count, rows } = await Subscription.findAndCountAll({
      where: { active: true },
      include: [
        { model: Plan, where: { is_trial: false } },
        { model: User },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const result = rows.map((sub) => ({
      id: sub.id,
      user_id: sub.User?.id,
      telegram_id: sub.User?.telegram_id,
      username: sub.User?.username,
      first_name: sub.User?.first_name,
      source: sub.User?.source || null,
      plan: sub.Plan?.name,
      started_at: sub.started_at,
      expires_at: sub.expires_at,
      traffic_used: sub.traffic_used,
      traffic_limit: sub.traffic_limit,
      throttled: sub.throttled,
      created_at: sub.createdAt,
    }));

    res.json({
      users: result,
      total: count,
      page,
      pages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('❌ Admin paid users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users/inactive — мёртвые юзеры
router.get('/inactive', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const type = req.query.type || 'expired_trial'; // expired_trial | expired_paid | no_sub

    if (type === 'no_sub') {
      const { count, rows } = await User.findAndCountAll({
        where: { id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions")') } },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      const result = rows.map((u) => ({
        user_id: u.id,
        telegram_id: u.telegram_id,
        username: u.username,
        first_name: u.first_name,
        source: u.source || null,
        registered_at: u.createdAt,
      }));

      return res.json({
        users: result,
        total: count,
        page,
        pages: Math.ceil(count / limit),
        type: 'no_sub',
      });
    }

    const expiredWhere = {
      active: false,
      user_id: { [Op.notIn]: literal('(SELECT DISTINCT user_id FROM "Subscriptions" WHERE active = true)') },
    };

    const isTrial = type === 'expired_trial';

    const { count, rows } = await Subscription.findAndCountAll({
      where: expiredWhere,
      include: [
        { model: Plan, where: { is_trial: isTrial } },
        { model: User },
      ],
      order: [['expires_at', 'DESC']],
      limit,
      offset,
    });

    const result = rows.map((sub) => ({
      user_id: sub.User?.id,
      telegram_id: sub.User?.telegram_id,
      username: sub.User?.username,
      first_name: sub.User?.first_name,
      source: sub.User?.source || null,
      plan: sub.Plan?.name,
      started_at: sub.started_at,
      expires_at: sub.expires_at,
      traffic_used: sub.traffic_used,
      traffic_limit: sub.traffic_limit,
      registered_at: sub.User?.createdAt,
    }));

    res.json({
      users: result,
      total: count,
      page,
      pages: Math.ceil(count / limit),
      type,
    });
  } catch (err) {
    console.error('❌ Admin inactive users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users/trial — триальные подписки с пагинацией и фильтрацией
router.get('/trial', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const sourceFilter = req.query.source || null;
    const hideUnused = req.query.hide_unused === '1';

    // Фильтры на User
    const userWhere = {};
    if (sourceFilter) {
      userWhere.source = sourceFilter === 'organic' ? null : sourceFilter;
    }

    // Фильтр по трафику
    const subWhere = { active: true };
    if (hideUnused) {
      subWhere.traffic_used = { [Op.gt]: 0 };
    }

    const { count, rows } = await Subscription.findAndCountAll({
      where: subWhere,
      include: [
        { model: Plan, where: { is_trial: true } },
        { model: User, where: Object.keys(userWhere).length > 0 ? userWhere : undefined },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const result = rows.map((sub) => ({
      id: sub.id,
      user_id: sub.User?.id,
      telegram_id: sub.User?.telegram_id,
      username: sub.User?.username,
      first_name: sub.User?.first_name,
      source: sub.User?.source || null,
      plan: sub.Plan?.name,
      started_at: sub.started_at,
      expires_at: sub.expires_at,
      traffic_used: sub.traffic_used,
      traffic_limit: sub.traffic_limit,
      throttled: sub.throttled,
      created_at: sub.createdAt,
    }));

    // Уникальные source для dropdown
    const allSources = await User.findAll({
      attributes: ['source'],
      group: ['source'],
      raw: true,
    });
    const sources = allSources.map((s) => s.source || 'organic').filter((v, i, a) => a.indexOf(v) === i).sort();

    res.json({
      users: result,
      total: count,
      page,
      pages: Math.ceil(count / limit),
      sources,
    });
  } catch (err) {
    console.error('❌ Admin trial users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    // Ищем старую подписку до деактивации
    const oldSub = await Subscription.findOne({
      where: { user_id: user.id, active: true },
    });

    // Деактивируем старые подписки
    await Subscription.update(
      { active: false },
      { where: { user_id: user.id, active: true } },
    );

    // Продлеваем от expires_at старой подписки если она ещё не истекла
    const now = Date.now();
    const baseDate = oldSub
      ? Math.max(now, new Date(oldSub.expires_at).getTime())
      : now;

    // Создаём новую
    const sub = await Subscription.create({
      user_id: user.id,
      plan_id: plan.id,
      started_at: new Date(),
      expires_at: new Date(baseDate + durationDays * 24 * 60 * 60 * 1000),
      traffic_limit: plan.traffic_limit_bytes,
      traffic_used: 0,
      throttled: false,
      active: true,
    });

    // Если юзер уже на нодах — обновляем лимит, если нет — добавляем
    await syncUserOnAllNodes(user.uuid, Number(plan.traffic_limit_bytes));

    res.status(201).json({ subscription: sub });
  } catch (err) {
    console.error('❌ Admin grant sub:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/throttle — ручной тротл
router.post('/:id/throttle', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = await Subscription.findOne({ where: { user_id: user.id, active: true } });
    if (!sub) return res.status(400).json({ error: 'No active subscription' });

    await sub.update({ throttled: true, traffic_used: sub.traffic_limit });
    await throttleOnAllNodes(user.uuid);

    console.log(`🔒 Admin throttle: user ${user.id} (${user.username || user.telegram_id})`);
    res.json({ message: `User ${user.id} throttled` });
  } catch (err) {
    console.error('❌ Admin throttle:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/unthrottle — снять ручной тротл
router.post('/:id/unthrottle', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = await Subscription.findOne({ where: { user_id: user.id, active: true } });
    if (!sub) return res.status(400).json({ error: 'No active subscription' });

    await sub.update({ throttled: false, traffic_used: 0 });
    await unthrottleOnAllNodes(user.uuid);

    console.log(`🔓 Admin unthrottle: user ${user.id} (${user.username || user.telegram_id})`);
    res.json({ message: `User ${user.id} unthrottled` });
  } catch (err) {
    console.error('❌ Admin unthrottle:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;