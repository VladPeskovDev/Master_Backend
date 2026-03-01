const express = require('express');
const { User, Subscription, Plan, Node } = require('../../db/models');
const { getHealthCache } = require('../workers/healthChecker');

const router = express.Router();

/*
 GET /sub/:token
 Зачем: VPN-клиент (V2Box, v2rayNG) дёргает каждый час.
 Отдаём VLESS-конфиг с наименее загруженной нодой.
 Если подписка истекла — пустой ответ, клиент не подключится.
 для теста curl http://localhost:3000/sub/TOKEN
 */

router.get('/:token', async (req, res) => {
  try {
    const user = await User.findOne({ where: { sub_token: req.params.token } });

    if (!user) {
      return res.status(404).send('');
    }

    const sub = await Subscription.findOne({
      where: { user_id: user.id, active: true },
      include: [{ model: Plan }],
    });

    // Нет активной подписки — пустой ответ
    if (!sub) {
      return res.status(200).send('');
    }

    // Получаем активные ноды
    const nodes = await Node.findAll({ where: { active: true } });

    if (nodes.length === 0) {
      return res.status(503).send('');
    }

    // Выбираем наименее загруженную ноду по health cache
    const cache = getHealthCache();
    let node;

    if (Object.keys(cache).length > 0) {
      node = nodes.sort((a, b) => {
        const connA = cache[a.id]?.active_connections || 0;
        const connB = cache[b.id]?.active_connections || 0;
        return connA - connB;
      })[0];
    } else {
      node = nodes[Math.floor(Math.random() * nodes.length)];
    }

    // Генерируем VLESS ссылку
    const vlessLink = [
      `vless://${user.uuid}@${node.domain}:443`,
      `?type=ws`,
      `&security=tls`,
      `&path=%2Fvflux`,
      `&encryption=none`,
      `#V-Flux-${node.location.replace(/\s/g, '-')}`,
    ].join('');

    // V2Box/v2rayNG ожидают base64
    const base64 = Buffer.from(vlessLink).toString('base64');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // Триал — показываем лимит трафика, платная — только дату окончания
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