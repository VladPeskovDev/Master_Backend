const cron = require('node-cron');
const { Node, User, Subscription } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');
const { throttleOnAllNodes, unthrottleOnAllNodes } = require('../services/nodeService');

/*
 * Каждые 30 минут:
 * 1. GET /stats со всех нод → собираем трафик по UUID
 * 2. Обновляем traffic_used в подписке
 * 3. POST /reset-traffic/:uuid на нодах → обнуляем счётчик
 * 4. Если traffic_used >= traffic_limit → throttle (превышение лимита)
 * 5. Если суммарные коннекты > MAX → throttle (раздача ссылки)
 * 6. Если коннекты вернулись в норму → unthrottle
 */

const MAX_CONNECTIONS_PER_USER = 256;

const runTrafficCollection = async () => {
  try {
    const nodes = await Node.findAll({ where: { active: true } });

    const allStats = {};
    const connectionsByUuid = {};

    const results = await Promise.allSettled(
      nodes.map(async (node) => {
        const api = createNodeApi(node.host, node.port, node.token);
        const res = await api.get('/stats');
        return { node, data: res.data };
      }),
    );

    // Суммируем трафик и коннекты по UUID со всех нод
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;

      const { node, data } = result.value;
      const users = data.users || [];

      for (const u of users) {
        // Трафик
        const total = (u.bytes_up || 0) + (u.bytes_down || 0);
        if (total > 0) {
          if (!allStats[u.uuid]) {
            allStats[u.uuid] = { total: 0, nodes: [] };
          }
          allStats[u.uuid].total += total;
          allStats[u.uuid].nodes.push(node);
        }

        // Коннекты (считаем даже если трафик 0)
        if (u.active_connections > 0) {
           if (!connectionsByUuid[u.uuid]) connectionsByUuid[u.uuid] = 0;
           connectionsByUuid[u.uuid] += u.active_connections;
        }
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

      // Проверяем лимит трафика
      if (newTrafficUsed >= Number(sub.traffic_limit)) {
        if (!sub.throttled) {
          await throttleOnAllNodes(uuid);
          await sub.update({ throttled: true });
          console.log(`⚠️ Throttled (трафик) ${uuid}: ${formatBytes(newTrafficUsed)} / ${formatBytes(sub.traffic_limit)}`);
        }
      }
    }

    // Проверяем мультиаккаунт — суммарные коннекты со всех нод
    // Антишаринг — только онлайн юзеры
    for (const [uuid, totalConns] of Object.entries(connectionsByUuid)) {
      if (totalConns > MAX_CONNECTIONS_PER_USER) {
        const user = await User.findOne({ where: { uuid } });
        if (!user) continue;

        const sub = await Subscription.findOne({
          where: { user_id: user.id, active: true },
        });
        if (!sub || sub.throttled) continue;

        await throttleOnAllNodes(uuid);
        await sub.update({ throttled: true });
        console.log(`🚫 Throttled (антишаринг) ${uuid}: ${totalConns} коннектов`);
      }
    }

    // Auto-unthrottle — одним запросом все throttled подписки
    const throttledSubs = await Subscription.findAll({
      where: { active: true, throttled: true },
      include: [{ model: User }],
    });

    for (const sub of throttledSubs) {
      const uuid = sub.User.uuid;
      const currentConns = connectionsByUuid[uuid] || 0;
      const trafficOk = Number(sub.traffic_used) < Number(sub.traffic_limit);

      if (currentConns <= MAX_CONNECTIONS_PER_USER && trafficOk) {
        await unthrottleOnAllNodes(uuid);
        await sub.update({ throttled: false });
        console.log(`✅ Unthrottled ${uuid}: коннекты ${currentConns}, трафик в норме`);
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

/*
 * ============================================
 * ПРИНЦИП РАБОТЫ TRAFFIC COLLECTOR
 * ============================================
 *
 * СБОР ТРАФИКА:
 * - Каждые 30 мин дёргаем GET /stats со всех активных нод
 * - Нода отдаёт массив юзеров с bytes_up / bytes_down
 * - Суммируем трафик по UUID со всех нод (юзер может быть на нескольких)
 * - Прибавляем к subscriptions.traffic_used в БД
 * - Делаем POST /reset-traffic/:uuid на нодах — обнуляем счётчик
 * - Поэтому на ноде всегда мало трафика, а в БД — накопленная сумма
 *
 * THROTTLE ПО ТРАФИКУ:
 * - Если traffic_used >= traffic_limit → throttleOnAllNodes(uuid)
 * - Скорость падает до 2-3 Mbps (настройка на ноде)
 * - Юзер видит медленный инет, а не блокировку
 * - Маркетируем как "безлимит" — технически есть лимит, но не блокируем
 *
 * THROTTLE ПО МУЛЬТИАККАУНТУ (антишаринг):
 * - Суммируем active_connections по UUID со ВСЕХ нод
 * - 1 устройство ≈ 20-30 WebSocket соединений
 * - MAX_CONNECTIONS_PER_USER = 100 ≈ 3-4 устройства
 * - Если больше → throttleOnAllNodes → 2-3 Mbps на всех
 * - Друзья которым раздали ссылку уйдут сами
 *
 * AUTO-UNTHROTTLE:
 * - Если коннекты вернулись в норму (<= 100) И трафик не превышен
 * - → unthrottleOnAllNodes → скорость восстановилась
 * - Юзер даже не заметил что был throttled
 * - Проверка каждые 30 мин — максимум 30 мин на 2-3 Mbps
 *
 * ЗАЩИТА ОТ РАЗДАЧИ ССЫЛКИ (два уровня):
 * 1. Нода: 60 сокетов на UUID на ноду (config.toml)
 *    - 4 ноды × 60 = максимум 240 сокетов
 *    - Мгновенная защита на уровне соединений
 * 2. Бэкенд: trafficCollector суммирует коннекты со всех нод
 *    - Если >256 суммарно → throttle
 *    - Ловит тех кто раскидался по нодам
 *
 * 
 * ТЕСТИРОВАНИЕ:
 *
 * 1. Тест сбора трафика:
 *    - Подключись к VPN, открой YouTube
 *    - Поменяй cron на *слеш2 (каждые 2 мин)
 *    - Смотри лог: "📊 Трафик собран: X юзеров обновлено"
 *    - psql: SELECT traffic_used FROM "Subscriptions" WHERE active = true
 *
 * 2. Тест throttle по трафику:
 *    - psql: UPDATE "Subscriptions" SET traffic_used = traffic_limit WHERE active = true
 *    - Жди цикл → лог: "⚠️ Throttled (трафик)"
 *    - Проверь на ноде: curl GET /users | jq → throttled: true
 *
 * 3. Тест антишаринг:
 *    - Поменяй MAX_CONNECTIONS_PER_USER = 5
 *    - Подключись к VPN (будет >5 сокетов)
 *    - Жди цикл → лог: "🚫 Throttled (антишаринг)"
 *
 * 4. Тест auto-unthrottle:
 *    - После теста 3 отключи VPN
 *    - Жди цикл → лог: "✅ Unthrottled"
 *    - Проверь на ноде: throttled: false
 *
 * Не забудь вернуть: MAX = 256, cron = *слеш30
 *
 */

