const express = require('express');
const { Node } = require('../../db/models');
const adminAuth = require('../middleware/adminAuth');
const createNodeApi = require('../utils/nodeApi');
const { getHealthCache } = require('../workers/healthChecker');


const router = express.Router();
router.use(adminAuth);

// GET /api/admin/nodes — все ноды
router.get('/', async (req, res) => {
  try {
    const nodes = await Node.findAll({ order: [['id', 'ASC']] });
    res.json({ nodes });
  } catch (err) {
    console.error('❌ Admin nodes list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/nodes/stats — статистика всех нод (health + stats)
router.get('/stats', async (req, res) => {
  try {
    const { Subscription, User, Plan } = require('../../db/models');

    const nodes = await Node.findAll({ where: { active: true } });
    const cache = getHealthCache();

    const nodeStats = nodes.map((node) => {
      const c = cache[node.id];
      if (!c) return { id: node.id, name: node.name, status: 'no data' };

      return {
        id: node.id,
        name: node.name,
        location: node.location,
        active_connections: c.active_connections,
        user_count: c.user_count,
        traffic_rx: formatTraffic(c.network_rx_bytes),
        traffic_tx: formatTraffic(c.network_tx_bytes),
        traffic_total: formatTraffic(c.network_rx_bytes + c.network_tx_bytes),
        current_speed_rx: formatSpeed(c.speed_rx),
        current_speed_tx: formatSpeed(c.speed_tx),
        uptime: formatUptime(c.uptime_secs),
      };
    });

    const totalUsers = await User.count();
    const activeSubs = await Subscription.count({ where: { active: true } });
    const expiredSubs = await Subscription.count({ where: { active: false } });

    res.json({
      nodes: nodeStats,
      db: {
        total_users: totalUsers,
        active_subscriptions: activeSubs,
        expired_subscriptions: expiredSubs,
      },
    });
  } catch (err) {
    console.error('❌ Admin nodes stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatTraffic(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

function formatSpeed(bytesPerSec) {
  const bits = bytesPerSec * 8;
  if (bits < 1000) return `${bits.toFixed(0)} bps`;
  if (bits < 1000000) return `${(bits / 1000).toFixed(1)} Kbps`;
  if (bits < 1000000000) return `${(bits / 1000000).toFixed(1)} Mbps`;
  return `${(bits / 1000000000).toFixed(2)} Gbps`;
}

function formatUptime(secs) {
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// POST /api/admin/nodes — добавить ноду
router.post('/', async (req, res) => {
  try {
    const { name, host, port, token, domain, location, max_users } = req.body;

    if (!name || !host || !port || !token || !domain) {
      return res.status(400).json({ error: 'Missing required fields: name, host, port, token, domain' });
    }

    const node = await Node.create({
      name,
      host,
      port,
      token,
      domain,
      location: location || '',
      max_users: max_users || 250,
      active: true,
    });

    res.status(201).json({ node });
  } catch (err) {
    console.error('❌ Admin node create:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/nodes/:id — обновить ноду
router.patch('/:id', async (req, res) => {
  try {
    const node = await Node.findByPk(req.params.id);

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const allowed = ['name', 'host', 'port', 'token', 'domain', 'location', 'max_users', 'active'];
    const updates = {};

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await node.update(updates);
    res.json({ node });
  } catch (err) {
    console.error('❌ Admin node update:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/nodes/:id — удалить ноду
router.delete('/:id', async (req, res) => {
  try {
    const node = await Node.findByPk(req.params.id);

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    await node.destroy();
    res.json({ message: `Node ${node.name} deleted` });
  } catch (err) {
    console.error('❌ Admin node delete:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;