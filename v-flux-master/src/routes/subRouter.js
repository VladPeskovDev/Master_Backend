const express = require('express');
const { User, Subscription, Plan, Node } = require('../../db/models');
const { getHealthCache } = require('../workers/healthChecker');
const { getFlag } = require('../utils/countryFlags');

const router = express.Router();

/*
 GET /sub/:token
 Зачем: VPN-клиент (V2Box, v2rayNG) дёргает каждый час.
 Отдаём VLESS-конфиг с наименее загруженной нодой.
 Если подписка истекла — пустой ответ, клиент не подключится.

 Балансировка (гибрид):
 1. Фильтр: убираем ноды где user_count >= max_users (нет места)
 2. Сортировка: из оставшихся — минимум active_connections
 3. Fallback: все полные — берём с минимум коннектов (лучше чем отказ)
 4. Fallback: кеш пуст (первый запуск) — случайная нода

 для теста curl http://localhost:3000/sub/TOKEN
 */

router.get('/:token', async (req, res) => {
  try {
    console.log(`📡 Sub request: UA=${req.headers['user-agent'] || 'none'}`);
    const user = await User.findOne({ where: { sub_token: req.params.token } });

    if (!user) {
      return res.status(404).send('');
    }

    const sub = await Subscription.findOne({
      where: { user_id: user.id, active: true },
      include: [{ model: Plan }],
    });

    if (!sub) {
      return res.status(200).send('');
    }

    const nodes = await Node.findAll({ where: { active: true } });

    if (nodes.length === 0) {
      return res.status(503).send('');
    }

    const cache = getHealthCache();
    let node;

    if (Object.keys(cache).length > 0) {
      // Фильтр: только ноды где есть место
      const available = nodes.filter((n) => {
        const usersOnNode = cache[n.id]?.user_count || 0;
        return usersOnNode < (n.max_users || 250);
      });

      // Сортировка по коннектам
      const sortByConns = (arr) =>
        arr.sort((a, b) => {
          const connA = cache[a.id]?.active_connections || 0;
          const connB = cache[b.id]?.active_connections || 0;
          return connA - connB;
        });

      if (available.length > 0) {
        node = sortByConns(available)[0];
      } else {
        // Все полные — fallback на минимум коннектов
        node = sortByConns([...nodes])[0];
      }
    } else {
      node = nodes[Math.floor(Math.random() * nodes.length)];
    }

    const vlessLink = [
      `vless://${user.uuid}@${node.domain}:443`,
      '?type=ws',
      '&security=tls',
      '&path=%2Fws',
      '&encryption=none',
      '&mux=off',
      `#${getFlag(node.location)} RockyVPN-${node.location.replace(/\s/g, '-')}`,
    ].join('');

    const base64 = Buffer.from(vlessLink).toString('base64');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    if (sub.Plan.is_trial) {
      res.setHeader('Subscription-Userinfo', `upload=0; download=${sub.traffic_used}; total=${sub.traffic_limit}; expire=${Math.floor(new Date(sub.expires_at).getTime() / 1000)}`);
    } else {
      res.setHeader('Subscription-Userinfo', `expire=${Math.floor(new Date(sub.expires_at).getTime() / 1000)}`);
    }

    res.send(base64);
  } catch (err) {
    console.error('❌ Ошибка в /sub/:token:', err);
    res.status(500).send('');
  }
});

module.exports = router;