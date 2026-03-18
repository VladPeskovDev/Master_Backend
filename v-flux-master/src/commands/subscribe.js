const { User, Plan, PlanPrice, Payment } = require('../../db/models');
const { t } = require('../locales');
const { createInvoice } = require('../services/cryptoPayService');
const { createOrder } = require('../services/rioPayService');

const CURRENCY_SYMBOLS = {
  RUB: '₽',
  USD: '$',
  UZS: 'so\'m',
};

const PLAN_TEXT_KEYS = {
  Monthly: 'subscribe_plan_monthly',
  'Semi-Annual': 'subscribe_plan_semi',
  Annual: 'subscribe_plan_annual',
};

const PLAN_ICONS = {
  Monthly: '📅',
  'Semi-Annual': '🔥',
  Annual: '👑',
};

const PLAN_NAME_KEYS = {
  Monthly: 'plan_name_monthly',
  'Semi-Annual': 'plan_name_semi',
  Annual: 'plan_name_annual',
};

const formatPrice = (price, currency) => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  // Для UZS — без копеек, с разделителем тысяч
  if (currency === 'UZS') {
    return { formatted: price.toLocaleString('ru-RU'), symbol };
  }
  return { formatted: String(price), symbol };
};

const buildSubscribeMessage = async (user) => {
  const lang = user.lang;
  const region = user.region || 'uae';

  const plans = await Plan.findAll({
    where: { active: true, is_trial: false },
    include: [{ model: PlanPrice, where: { region } }],
    order: [['duration_days', 'ASC']],
  });

  // Находим месячную цену для расчёта скидок
  const monthlyPlan = plans.find((p) => p.name === 'Monthly');
  const monthlyPrice = monthlyPlan?.PlanPrices[0]?.price || 0;

  let text = t(lang, 'subscribe_title') + '\n\n';

  const buttons = [];

  plans.forEach((plan) => {
    const price = plan.PlanPrices[0];
    const { formatted, symbol } = formatPrice(price.price, price.currency);

    const textKey = PLAN_TEXT_KEYS[plan.name] || 'subscribe_plan_monthly';
    const icon = PLAN_ICONS[plan.name] || '📅';

    if (plan.name === 'Monthly') {
      text += t(lang, textKey, {
        price: formatted,
        currency: symbol,
        days: plan.duration_days,
      }) + '\n\n';
    } else {
      // Вычисляем помесячную цену и скидку
      const months = Math.round(plan.duration_days / 30);
      const perMonth = Math.round(price.price / months);
      const discount = monthlyPrice > 0
        ? Math.round((1 - price.price / (monthlyPrice * months)) * 100)
        : 0;

      const { formatted: monthlyFormatted } = formatPrice(perMonth, price.currency);

      text += t(lang, textKey, {
        price: formatted,
        currency: symbol,
        days: plan.duration_days,
        monthly_price: monthlyFormatted,
        discount: discount > 0 ? discount : '0',
      }) + '\n\n';
    }

    // Кнопка с ценой
    const planName = t(lang, `plan_name_${plan.name === 'Semi-Annual' ? 'semi' : plan.name.toLowerCase()}`, { days: plan.duration_days });
    buttons.push([{
      text: `${icon} ${planName} — ${formatted} ${symbol}`,
      callback_data: `buy_plan_${plan.id}`,
    }]);
  });

  text += t(lang, 'subscribe_footer');

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

  // Из уведомления — новое сообщение (уведомление остаётся)
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'notify_subscribe') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const { text, buttons } = await buildSubscribeMessage(user);

      await bot.sendMessage(query.message.chat.id, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка notify_subscribe:', err);
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
      const region = user.region || 'uae';
      const planId = parseInt(query.data.replace('buy_plan_', ''), 10);

      const plan = await Plan.findOne({
        where: { id: planId },
        include: [{ model: PlanPrice, where: { region } }],
      });

      let paymentText;
      if (plan && plan.PlanPrices[0]) {
        const price = plan.PlanPrices[0];
        const { formatted, symbol } = formatPrice(price.price, price.currency);
        const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
        const planName = t(lang, planNameKey, { days: plan.duration_days });
        paymentText = t(lang, 'subscribe_choose_payment', { plan: planName, price: formatted, currency: symbol });
      } else {
        paymentText = t(lang, 'subscribe_choose_payment', { plan: '—', price: '—', currency: '' });
      }

      await bot.editMessageText(paymentText, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_pay_card'), callback_data: `pay_card_${planId}` }],
            [{ text: t(lang, 'btn_pay_crypto'), callback_data: `pay_crypto_${planId}` }],
            [{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка buy_plan:', err);
    }
  });

  // Оплата картой через RioPay (₽)
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_card_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';
      const planId = parseInt(query.data.replace('pay_card_', ''), 10);

      const plan = await Plan.findOne({
        where: { id: planId },
        include: [{ model: PlanPrice, where: { region: 'ru' } }],
      });

      if (!plan || !plan.PlanPrices[0]) {
        await bot.answerCallbackQuery(query.id, {
          text: t(lang, 'subscribe_payment_stub'),
          show_alert: true,
        });
        return;
      }

      const price = plan.PlanPrices[0];

      // Создаём Payment (pending)
      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: 'RUB',
        method: 'card',
        status: 'pending',
      });

      // Создаём заказ в RioPay
      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      const result = await createOrder({
        amount: price.price,
        currency: 'RUB',
        externalId: `pay_${payment.id}`,
        externalUserId: `user_${user.id}`,
        purpose: `Rocky VPN — ${planName}`,
      });

      // Сохраняем provider_id
      await payment.update({ provider_id: result.orderId });

      await bot.editMessageText(
        t(lang, 'payment_card_invoice', { plan: planName, amount: price.price, currency: '₽' }),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_pay_card_link'), url: result.paymentLink }],
              [{ text: t(lang, 'btn_back'), callback_data: `buy_plan_${planId}` }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_card:', err);
      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'Error creating payment. Try again.',
          show_alert: true,
        });
      } catch (answerErr) {
        console.error('❌ Ошибка answerCallbackQuery:', answerErr.message);
      }
    }
  });

  // Оплата криптой через CryptoPay
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_crypto_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';
      const planId = parseInt(query.data.replace('pay_crypto_', ''), 10);

      // Определяем крипто-регион
      const cryptoRegion = user.region === 'uae' ? 'crypto_uae' : 'crypto';

      const plan = await Plan.findOne({
        where: { id: planId },
        include: [{ model: PlanPrice, where: { region: cryptoRegion } }],
      });

      if (!plan || !plan.PlanPrices[0]) {
        await bot.answerCallbackQuery(query.id, {
          text: t(lang, 'subscribe_payment_stub'),
          show_alert: true,
        });
        return;
      }

      const price = plan.PlanPrices[0];

      // Создаём Payment (pending)
      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: 'USD',
        method: 'crypto',
        status: 'pending',
      });

      // Создаём инвойс в CryptoPay
      const invoice = await createInvoice({
        amount: price.price,
        userId: user.id,
        planId,
        chatId: query.message.chat.id,
      });

      // Сохраняем provider_id
      await payment.update({ provider_id: String(invoice.invoice_id) });

      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      await bot.editMessageText(
        t(lang, 'payment_crypto_invoice', { plan: planName, amount: (price.price / 100).toFixed(2) }),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_pay_crypto_link'), url: invoice.bot_invoice_url }],
              [{ text: t(lang, 'btn_back'), callback_data: `buy_plan_${planId}` }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_crypto:', err);
      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'Error creating invoice. Try again.',
          show_alert: true,
        });
      } catch (answerErr) {
        console.error('❌ Ошибка answerCallbackQuery:', answerErr.message);
      }
    }
  });
};

module.exports = setupSubscribeHandler;
