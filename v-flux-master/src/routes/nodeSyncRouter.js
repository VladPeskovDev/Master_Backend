const express = require('express');
const { Node } = require('../../db/models');
const { getActiveUsers } = require('../services/nodeService');

const router = express.Router();

// GET /api/nodes/sync — нода дёргает при старте
router.get('/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const node = await Node.findOne({ where: { token, active: true } });

    if (!node) {
      return res.status(403).json({ error: 'Invalid node token' });
    }

    const users = await getActiveUsers();

    // Обновляем last_health_at — нода жива, раз дёргает sync
    await node.update({ last_health_at: new Date() });

    res.json({ users });
  } catch (err) {
    console.error('❌ Ошибка в /nodes/sync:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;



/*
 * GET /api/nodes/sync
 *
 * Зачем: V-Flux нода при старте/рестарте теряет юзеров из памяти.
 * Этот эндпоинт отдаёт ноде полный список активных юзеров.
 * Нода авторизуется своим Bearer токеном из config.toml.
 *
 * Кто дёргает: V-Flux нода автоматически при старте (fetch_users_from_master)
 * Ответ: { users: [{ uuid, traffic_limit, throttled }] }
 *
 * curl -H "Authorization: Bearer test-node-token-123" http://localhost:3000/api/nodes/sync
 */