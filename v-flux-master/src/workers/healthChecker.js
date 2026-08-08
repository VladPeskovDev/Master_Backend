const cron = require('node-cron');
const { Node } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');

/*
 * Каждые 6 минут:
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
        // /health — общие метрики, /stats — список юзеров для подсчёта реально онлайн
        const [health, stats] = await Promise.all([
          api.get('/health'),
          api.get('/stats').catch(() => ({ data: { users: [] } })),
        ]);
        const usersOnline = (stats.data.users || [])
          .filter((u) => u.active_connections > 0).length;
        return { nodeId: node.id, data: health.data, usersOnline };
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
          users_online: result.value.usersOnline || 0,
          network_rx_bytes: d.network_rx_bytes || 0,
          network_tx_bytes: d.network_tx_bytes || 0,
          uptime_secs: d.uptime_secs || 0,
          speed_rx,
          speed_tx,
          cpu_load: d.cpu_load ?? null,
          memory_total_bytes: d.memory_total_bytes || null,
          memory_used_bytes: d.memory_used_bytes || null,
        };

        // Сохраняем снепшот для следующего сравнения
        prevSnapshot[node.id] = {
          rx: d.network_rx_bytes || 0,
          tx: d.network_tx_bytes || 0,
          timestamp: now,
        };

        const online = newCache[node.id].users_online;
        const max = node.max_users || 250;
        const pct = Math.min(100, Math.round((online / max) * 100));
        console.log(`✅ Нода ${node.name}: OK, load: ${pct}%`);
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
  cron.schedule('1,6,11,16,21,26,31,36,41,46,51,56 * * * *', runHealthCheck);
  //console.log('🏥 Health checker запущен (каждые 5 мин)');
};

module.exports = { startHealthChecker, getHealthCache };