const app = require('./app');
require('dotenv').config();

const { startHealthChecker } = require('./workers/healthChecker');
const { startTrafficCollector } = require('./workers/trafficCollector');
const { startSubscriptionChecker } = require('./workers/subscriptionChecker');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server has started on port', PORT);

  // Запускаем воркеры
  startHealthChecker();
  startTrafficCollector();
  startSubscriptionChecker();
});