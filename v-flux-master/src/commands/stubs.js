const { User } = require('../../db/models');
const { t } = require('../locales');

const STUB_ACTIONS = ['connect', 'account', 'subscribe', 'referral', 'help'];

const setupStubs = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      if (!STUB_ACTIONS.includes(query.data)) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      const lang = user?.lang || 'en';

      await bot.answerCallbackQuery(query.id, { text: t(lang, 'stub'), show_alert: true });
    } catch (err) {
      console.error('❌ Ошибка stub:', err);
    }
  });
};

module.exports = setupStubs;