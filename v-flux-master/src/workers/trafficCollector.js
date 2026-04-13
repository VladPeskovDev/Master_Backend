const cron = require('node-cron');
const { Node, User, Subscription, Plan } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');
const { throttleOnAllNodes, unthrottleOnAllNodes } = require('../services/nodeService');
const bot = require('../bot');
const { t } = require('../locales');

const MAX_CONNECTIONS_PER_USER = 256;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        const total = (u.bytes_up || 0) + (u.bytes_down || 0);
        if (total > 0) {
          if (!allStats[u.uuid]) {
            allStats[u.uuid] = { total: 0, nodes: [] };
          }
          allStats[u.uuid].total += total;
          allStats[u.uuid].nodes.push(node);
        }

        if (u.active_connections > 0) {
          if (!connectionsByUuid[u.uuid]) connectionsByUuid[u.uuid] = 0;
          connectionsByUuid[u.uuid] += u.active_connections;
        }
      }
    }

    // Собираем все UUID которые нужны (трафик + онлайн)
    const allUuids = [...new Set([
      ...Object.keys(allStats),
      ...Object.keys(connectionsByUuid),
    ])];

    if (allUuids.length === 0) {
      console.log('📊 Трафик собран: 0 юзеров обновлено');
      return;
    }

    // Один запрос — все юзеры с активными подписками
    const dbUsers = await User.findAll({
      where: { uuid: allUuids },
      include: [{
        model: Subscription,
        where: { active: true },
        required: false,
      }],
    });

    // Map для быстрого доступа
    const userMap = {};
    dbUsers.forEach((u) => {
      userMap[u.uuid] = {
        user: u,
        sub: u.Subscriptions?.[0] || null,
      };
    });

    // Обновляем трафик и ресетим на нодах
    for (const [uuid, stats] of Object.entries(allStats)) {
      const entry = userMap[uuid];
      if (!entry || !entry.sub) continue;

      const { sub } = entry;

      const newTrafficUsed = Number(sub.traffic_used) + stats.total;
      await sub.update({ traffic_used: newTrafficUsed });

      for (const node of stats.nodes) {
        try {
          const api = createNodeApi(node.host, node.port, node.token);
          await api.post(`/users/${uuid}/reset-traffic`);
          await sleep(150);
        } catch (err) {
          console.error(`❌ Reset traffic ${uuid} на ${node.name}: ${err.message}`);
        }
      }

      if (newTrafficUsed >= Number(sub.traffic_limit)) {
        if (!sub.throttled) {
          await throttleOnAllNodes(uuid);
          await sub.update({ throttled: true });
          console.log(`⚠️ Throttled (трафик) ${uuid}: ${formatBytes(newTrafficUsed)} / ${formatBytes(sub.traffic_limit)}`);

          // Уведомляем триал-юзера о тротле
          try {
            const plan = await Plan.findByPk(sub.plan_id);
            if (plan?.is_trial && entry.user) {
              const lang = entry.user.lang || 'en';
              await bot.sendMessage(entry.user.telegram_id, t(lang, 'notify_throttled_trial'), {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: t(lang, 'btn_get_subscription'), callback_data: 'subscribe' }],
                  ],
                },
              });
            }
          } catch (notifyErr) {
            if (notifyErr?.response?.statusCode !== 403) {
              console.error(`❌ Notify throttle ${uuid}:`, notifyErr.message);
            }
          }
        }
      }
    }

    // Антишаринг — данные уже в userMap
    for (const [uuid, totalConns] of Object.entries(connectionsByUuid)) {
      if (totalConns <= MAX_CONNECTIONS_PER_USER) continue;

      const entry = userMap[uuid];
      if (!entry || !entry.sub || entry.sub.throttled) continue;

      await throttleOnAllNodes(uuid);
      await entry.sub.update({ throttled: true });
      console.log(`🚫 Throttled (антишаринг) ${uuid}: ${totalConns} коннектов`);
    }

    // Auto-unthrottle — один запрос throttled подписок
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

    // Re-sync throttle — если в БД throttled, но на ноде нет
    for (const sub of throttledSubs) {
      const uuid = sub.User.uuid;
      const trafficOver = Number(sub.traffic_used) >= Number(sub.traffic_limit);
      if (trafficOver) {
        await throttleOnAllNodes(uuid);
        await sleep(50);
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
  cron.schedule('5,35 * * * *', runTrafficCollection);
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
 * ОПТИМИЗАЦИЯ:
 * - Один User.findAll с include Subscription вместо поштучных запросов
 * - userMap по UUID — мгновенный доступ в обоих циклах
 * - 1000 онлайн = 2 SQL запроса вместо 4000
 *
 * THROTTLE ПО ТРАФИКУ:
 * - Если traffic_used >= traffic_limit → throttleOnAllNodes(uuid)
 * - Скорость падает до 2-3 Mbps (настройка на ноде)
 * - Юзер видит медленный инет, а не блокировку
 *
 * THROTTLE ПО АНТИШАРИНГУ:
 * - Суммируем active_connections по UUID со ВСЕХ нод
 * - 1 устройство ≈ 20-30 WebSocket соединений
 * - MAX_CONNECTIONS_PER_USER = 256
 * - Если больше → throttleOnAllNodes → 2-3 Mbps на всех
 * - Друзья которым раздали ссылку уйдут сами
 *
 * AUTO-UNTHROTTLE:
 * - Если коннекты вернулись в норму (<= 256) И трафик не превышен
 * - → unthrottleOnAllNodes → скорость восстановилась
 * - Проверка каждые 30 мин — максимум 30 мин на 2-3 Mbps
 *
 * ТЕСТИРОВАНИЕ:
 *
 * 1. Тест сбора трафика:
 *    - Подключись к VPN, открой YouTube
 *    - Поменяй cron на каждые 2 мин
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
 *  вернуть: MAX = 256, cron = каждые 30 мин
 *
 * ============================================
 */
