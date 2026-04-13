const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, User } = require('../../db/models');
const { removeUserFromAllNodes } = require('../services/nodeService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Каждый час:
 * Находим подписки где expires_at < NOW() и active = true
 * Ставим active = false
 * removeUserFromAllNodes(uuid) → юзер отключается
 * При обновлении V2Box → пустой ответ → нет VPN
 */

const runSubscriptionCheck = async () => {
  try {
    const expired = await Subscription.findAll({
      where: {
        active: true,
        expires_at: { [Op.lt]: new Date() },
      },
      include: [{ model: User }],
    });

    if (expired.length === 0) {
      console.log('✅ Нет истёкших подписок');
      return;
    }

    for (const sub of expired) {
      await sub.update({ active: false });
      await removeUserFromAllNodes(sub.User.uuid);
      await sleep(150);
      console.log(`⏰ Подписка истекла: ${sub.User.uuid} (${sub.User.username || sub.User.telegram_id})`);
    }

    console.log(`⏰ Деактивировано подписок: ${expired.length}`);
  } catch (err) {
    console.error('❌ Subscription checker error:', err);
  }
};

 const startSubscriptionChecker = () => {
  cron.schedule('15 * * * *', runSubscriptionCheck);
  console.log('⏰ Subscription checker запущен (каждый час)');
}; 

// const startSubscriptionChecker = () => {
 // cron.schedule('*/2 * * * *', runSubscriptionCheck);
 // console.log('⏰ Subscription checker запущен (каждые 2 мин)');
//}; 


module.exports = { startSubscriptionChecker, runSubscriptionCheck };