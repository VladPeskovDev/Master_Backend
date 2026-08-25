const express = require('express');
const { User, Subscription, Plan, Node } = require('../../db/models');
const { getHealthCache } = require('../workers/healthChecker');
const { getFlag } = require('../utils/countryFlags');

const router = express.Router();

/*
 GET /sub/:token
 Зачем: VPN-клиент (V2Box, v2rayNG) дёргает каждый час.
 Отдаём VLESS-подписку — СПИСОК всех активных нод, в имени каждой процент загрузки.
 Загрузка = user_count / max_users * 100 (учитывает, что ноды разной мощности).
 Сортировка: менее загруженные — сверху.
 Если подписка истекла — пустой ответ, клиент не подключится.

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
    const nodesWithLoad = nodes.map((n) => {
      // users_online — реально сидящие юзеры (не сокеты, не прописанные)
      const users = cache[n.id]?.users_online ?? 0;
      const max = n.max_users || 250;
      const loadPct = Math.min(100, Math.round((users / max) * 100));
      return { node: n, loadPct };
    });

    // Менее загруженные — сверху
    nodesWithLoad.sort((a, b) => a.loadPct - b.loadPct);

    // Имя ноды в # обязательно кодируем: v2rayTUN/V2Box строго парсят фрагмент,
    // голый % и em-dash ломают подписку на этих клиентах.
    // sni+host обязательны — обновлённый XrayCore в Happ+ иначе падает с "json corrupted".
    // mux=off из URL убран — не входит в VLESS URL-спеку, строгие парсеры ругаются.
    const links = nodesWithLoad.map(({ node, loadPct }) => {
      const label = `${getFlag(node.location)} ${node.location.replace(/\s/g, '-')} - ${loadPct}%`;
      return [
        `vless://${user.uuid}@${node.domain}:443`,
        '?type=ws',
        '&security=tls',
        `&sni=${node.domain}`,
        `&host=${node.domain}`,
        '&path=%2Fws',
        '&encryption=none',
        `#${encodeURIComponent(label)}`,
      ].join('');
    });

    const base64 = Buffer.from(links.join('\n')).toString('base64');

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