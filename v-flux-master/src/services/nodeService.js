const { Node, User, Subscription } = require('../../db/models');
const createNodeApi = require('../utils/nodeApi');

// Получить все активные ноды из БД
const getActiveNodes = async () => {
  return Node.findAll({ where: { active: true } });
};

// Получить всех юзеров с активной подпиской (для sync)
const getActiveUsers = async () => {
  const subscriptions = await Subscription.findAll({
    where: { active: true },
    include: [{ model: User, attributes: ['uuid'] }],
  });

  return subscriptions.map((sub) => ({
    uuid: sub.User.uuid,
    traffic_limit: Number(sub.traffic_limit),
    throttled: sub.throttled,
  }));
};

// Добавить юзера на все активные ноды
const addUserToAllNodes = async (uuid, trafficLimit) => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map((node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      return api.post('/users', { uuid, traffic_limit: trafficLimit });
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка добавления на ноду ${nodes[i].name}: ${result.reason.message}`);
    }
  });
};

// Удалить юзера со всех активных нод
const removeUserFromAllNodes = async (uuid) => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map((node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      return api.delete(`/users/${uuid}`);
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка удаления с ноды ${nodes[i].name}: ${result.reason.message}`);
    }
  });
};

// Throttle юзера на всех нодах
const throttleOnAllNodes = async (uuid) => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map((node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      return api.post(`/users/${uuid}/throttle`);
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка throttle на ноде ${nodes[i].name}: ${result.reason.message}`);
    }
  });
};

// Unthrottle юзера на всех нодах
const unthrottleOnAllNodes = async (uuid) => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map((node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      return api.post(`/users/${uuid}/unthrottle`);
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка unthrottle на ноде ${nodes[i].name}: ${result.reason.message}`);
    }
  });
};

// Reset трафика юзера на всех нодах
const resetTrafficOnAllNodes = async (uuid) => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map((node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      return api.post(`/users/${uuid}/reset-traffic`);
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка reset на ноде ${nodes[i].name}: ${result.reason.message}`);
    }
  });
};

// Собрать /stats со всех нод
const getStatsFromAllNodes = async () => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map(async (node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      const res = await api.get('/stats');
      return { nodeId: node.id, nodeName: node.name, data: res.data };
    }),
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
};

// Собрать /health со всех нод
const getHealthFromAllNodes = async () => {
  const nodes = await getActiveNodes();
  const results = await Promise.allSettled(
    nodes.map(async (node) => {
      const api = createNodeApi(node.host, node.port, node.token);
      const res = await api.get('/health');
      return { nodeId: node.id, nodeName: node.name, data: res.data };
    }),
  );

  return results.map((r, i) => ({
    nodeId: nodes[i].id,
    nodeName: nodes[i].name,
    status: r.status === 'fulfilled' ? 'ok' : 'down',
    data: r.status === 'fulfilled' ? r.value.data : null,
    error: r.status === 'rejected' ? r.reason.message : null,
  }));
};

module.exports = {
  getActiveNodes,
  getActiveUsers,
  addUserToAllNodes,
  removeUserFromAllNodes,
  throttleOnAllNodes,
  unthrottleOnAllNodes,
  resetTrafficOnAllNodes,
  getStatsFromAllNodes,
  getHealthFromAllNodes,
};