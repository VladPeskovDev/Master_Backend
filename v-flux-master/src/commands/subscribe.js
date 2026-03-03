const { User, Plan, PlanPrice } = require('../../db/models');
const { t } = require('../locales');

const PLAN_ICONS = {
  Monthly: '📅',
  'Semi-Annual': '📦',
  Annual: '👑',
};

const buildSubscribeMessage = async (user) => {
  const lang = user.lang;
  const region = user.region || 'uae';

  const plans = await Plan.findAll({
    where: { active: true, is_trial: false },
    include: [{ model: PlanPrice, where: { region } }],
    order: [['duration_days', 'ASC']],
  });

  let text = t(lang, 'subscribe_title') + '\n\n';

  plans.forEach((plan) => {
    const price = plan.PlanPrices[0];
    text += t(lang, 'subscribe_plan', {
      icon: PLAN_ICONS[plan.name] || '📦',
      name: plan.name,
      days: plan.duration_days,
      price: price.price,
      currency: price.currency,
    }) + '\n\n';
  });

  const buttons = plans.map((plan) => [
    { text: `${PLAN_ICONS[plan.name] || '📦'} ${plan.name}`, callback_data: `buy_plan_${plan.id}` },
  ]);
  buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }]);

  return { text, buttons };
};

const setupSubscribeHandler = (bot) => {
  // Кнопка из меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'subscribe') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const { text, buttons } = await buildSubscribeMessage(user);

      await bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка subscribe:', err);
    }
  });

  // Слеш-команда /subscribe
  bot.onText(/\/subscribe/, async (msg) => {
    try {
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) return;

      const { text, buttons } = await buildSubscribeMessage(user);

      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('❌ Ошибка /subscribe:', err);
    }
  });

  // Выбор способа оплаты
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('buy_plan_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      await bot.editMessageText(t(lang, 'subscribe_choose_payment'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_pay_card'), callback_data: 'pay_card_stub' }],
            [{ text: t(lang, 'btn_pay_stars'), callback_data: 'pay_stars_stub' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка buy_plan:', err);
    }
  });

  // Заглушки оплаты
  bot.on('callback_query', async (query) => {
    try {
      if (!['pay_card_stub', 'pay_stars_stub'].includes(query.data)) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      const lang = user?.lang || 'en';

      await bot.answerCallbackQuery(query.id, {
        text: t(lang, 'subscribe_payment_stub'),
        show_alert: true,
      });
    } catch (err) {
      console.error('❌ Ошибка pay stub:', err);
    }
  });
};

module.exports = setupSubscribeHandler;