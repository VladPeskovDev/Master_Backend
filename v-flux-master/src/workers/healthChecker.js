const cron = require('node-cron');
const { Node } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');

/*
 * Каждые 5 минут:
 * GET /health на все ноды
 * Ответила → active = true, обновляем last_health_at
 * Не ответила → active = false, /sub/:token не выдаёт эту ноду
 */

// Кеш здоровья нод (для балансировки в /sub/:token)
let healthCache = {};
let prevSnapshot = {};

const getHealthCache = () => healthCache;

const runHealthCheck = async () => {
  try {
    const nodes = await Node.findAll();

    const results = await Promise.allSettled(
      nodes.map(async (node) => {
        const api = createNodeApi(node.host, node.port, node.token);
        const res = await api.get('/health');
        return { nodeId: node.id, data: res.data };
      }),
    );

    const newCache = {};
    const now = Date.now();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        await node.update({ active: true, last_health_at: new Date() });

        const d = result.value.data;
        const prev = prevSnapshot[node.id];

        // Считаем текущую скорость из разницы с прошлым замером
        let speed_rx = 0;
        let speed_tx = 0;

        if (prev) {
          const timeDiff = (now - prev.timestamp) / 1000; // секунды
          if (timeDiff > 0) {
            speed_rx = ((d.network_rx_bytes || 0) - prev.rx) / timeDiff;
            speed_tx = ((d.network_tx_bytes || 0) - prev.tx) / timeDiff;
          }
        }

        newCache[node.id] = {
          active_connections: d.current_active_connections || 0,
          user_count: d.user_count || 0,
          network_rx_bytes: d.network_rx_bytes || 0,
          network_tx_bytes: d.network_tx_bytes || 0,
          uptime_secs: d.uptime_secs || 0,
          speed_rx,
          speed_tx,
        };

        // Сохраняем снепшот для следующего сравнения
        prevSnapshot[node.id] = {
          rx: d.network_rx_bytes || 0,
          tx: d.network_tx_bytes || 0,
          timestamp: now,
        };

        console.log(`✅ Нода ${node.name}: OK, connections: ${newCache[node.id].active_connections}`);
      } else {
        await node.update({ active: false });
        console.error(`❌ Нода ${node.name}: DOWN — ${result.reason.message}`);
      }
    }

    healthCache = newCache;
  } catch (err) {
    console.error('❌ Health checker error:', err);
  }
};

const startHealthChecker = () => {
  runHealthCheck();
  cron.schedule('*/5 * * * *', runHealthCheck);
  console.log('🏥 Health checker запущен (каждые 5 мин)');
};

module.exports = { startHealthChecker, getHealthCache };