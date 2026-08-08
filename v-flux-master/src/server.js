const app = require('./app');
require('dotenv').config();

const { startHealthChecker } = require('./workers/healthChecker');
const { startTrafficCollector } = require('./workers/trafficCollector');
const { startSubscriptionChecker } = require('./workers/subscriptionChecker');
const { startSubscriptionNotifier } = require('./workers/subscriptionNotifier');
// const { startPromoNotifier } = require('./workers/promoNotifier'); // отключено — актуальных акций нет

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server has started on port', PORT);

  // Запускаем воркеры
  startHealthChecker();
  startTrafficCollector();
  startSubscriptionChecker();
  startSubscriptionNotifier();
  // startPromoNotifier(); // отключено — актуальных акций нет
});