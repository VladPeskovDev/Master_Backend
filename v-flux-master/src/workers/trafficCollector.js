const cron = require('node-cron');
const { Node, User, Subscription } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');
const { throttleOnAllNodes } = require('../services/nodeService');

/*
 * Каждые 30 минут:
 * GET /stats со всех нод → собираем трафик по UUID
 * Обновляем traffic_used в подписке
 * POST /reset-traffic/:uuid на нодах
 * Если traffic_used >= traffic_limit → throttle
 */

const runTrafficCollection = async () => {
  try {
    const nodes = await Node.findAll({ where: { active: true } });

    // Собираем статистику со всех нод
    const allStats = {};

    const results = await Promise.allSettled(
      nodes.map(async (node) => {
        const api = createNodeApi(node.host, node.port, node.token);
        const res = await api.get('/stats');
        return { node, data: res.data };
      }),
    );

    // Суммируем трафик по UUID со всех нод
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;

      const { node, data } = result.value;
      const users = data.users || [];

      for (const u of users) {
        const total = (u.bytes_up || 0) + (u.bytes_down || 0);
        if (total === 0) continue;

        if (!allStats[u.uuid]) {
          allStats[u.uuid] = { total: 0, nodes: [] };
        }
        allStats[u.uuid].total += total;
        allStats[u.uuid].nodes.push(node);
      }
    }

    // Обновляем трафик в БД и ресетим на нодах
    for (const [uuid, stats] of Object.entries(allStats)) {
      const user = await User.findOne({ where: { uuid } });
      if (!user) continue;

      const sub = await Subscription.findOne({
        where: { user_id: user.id, active: true },
      });
      if (!sub) continue;

      // Обновляем traffic_used
      const newTrafficUsed = Number(sub.traffic_used) + stats.total;
      await sub.update({ traffic_used: newTrafficUsed });

      // Ресетим трафик на нодах
      for (const node of stats.nodes) {
        try {
          const api = createNodeApi(node.host, node.port, node.token);
          await api.post(`/users/${uuid}/reset-traffic`);
        } catch (err) {
          console.error(`❌ Reset traffic ${uuid} на ${node.name}: ${err.message}`);
        }
      }

      // Проверяем лимит
      if (newTrafficUsed >= Number(sub.traffic_limit)) {
        if (!sub.throttled) {
          await throttleOnAllNodes(uuid);
          await sub.update({ throttled: true });
          console.log(`⚠️ Throttled ${uuid}: ${formatBytes(newTrafficUsed)} / ${formatBytes(sub.traffic_limit)}`);
        }
      }
    }

    console.log(`📊 Трафик собран: ${Object.keys(allStats).length} юзеров обновлено`);
  } catch (err) {
    console.error('❌ Traffic collector error:', err);
  }
};

const formatBytes = (bytes) => {
  const gb = Number(bytes) / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
};

const startTrafficCollector = () => {
  cron.schedule('*/30 * * * *', runTrafficCollection);
  console.log('📊 Traffic collector запущен (каждые 30 мин)');
};

module.exports = { startTrafficCollector, runTrafficCollection };