const { User, Plan, PlanPrice, Payment } = require('../../db/models');
const { t } = require('../locales');
const { createInvoice } = require('../services/cryptoPayService');
const { createOrder } = require('../services/rioPayService');
const { generatePaymentUrl } = require('../services/robokassaService');

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
  if (currency === 'UZS') {
    return { formatted: price.toLocaleString('ru-RU'), symbol };
  }
  return { formatted: String(price), symbol };
};

// Построить список планов с ценами для конкретного региона
const buildPlanButtons = async (lang, region, callbackPrefix, excludeMonthly = false) => {
  const plans = await Plan.findAll({
    where: { active: true, is_trial: false },
    include: [{ model: PlanPrice, where: { region } }],
    order: [['duration_days', 'ASC']],
  });

  // Крипто-цены в центах — конвертируем для отображения
  const isCents = region === 'crypto' || region === 'crypto_uae';

  const monthlyPlan = plans.find((p) => p.name === 'Monthly');
  const monthlyRaw = monthlyPlan?.PlanPrices[0]?.price || 0;
  const monthlyPrice = isCents ? monthlyRaw / 100 : monthlyRaw;

  let text = '';
  const buttons = [];

  plans.forEach((plan) => {
    if (excludeMonthly && plan.name === 'Monthly') return;

    const price = plan.PlanPrices[0];
    const displayPrice = isCents ? price.price / 100 : price.price;
    const { formatted, symbol } = formatPrice(displayPrice, price.currency);
    const textKey = PLAN_TEXT_KEYS[plan.name] || 'subscribe_plan_monthly';
    const icon = PLAN_ICONS[plan.name] || '📅';

    if (plan.name === 'Monthly') {
      text += t(lang, textKey, {
        price: formatted,
        currency: symbol,
        days: plan.duration_days,
      }) + '\n\n';
    } else {
      const months = Math.round(plan.duration_days / 30);
      const perMonth = isCents
        ? (price.price / 100 / months).toFixed(2)
        : Math.round(displayPrice / months);
      const discount = monthlyPrice > 0
        ? Math.round((1 - displayPrice / (monthlyPrice * months)) * 100)
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

    const planName = t(lang, `plan_name_${plan.name === 'Semi-Annual' ? 'semi' : plan.name.toLowerCase()}`, { days: plan.duration_days });
    buttons.push([{
      text: `${icon} ${planName} — ${formatted} ${symbol}`,
      callback_data: `${callbackPrefix}_${plan.id}`,
    }]);
  });

  return { text, buttons };
};

const setupSubscribeHandler = (bot) => {
  // ===== ШАГ 1: Подписка → выбор метода оплаты =====

  // Кнопка из меню
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'subscribe') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      await bot.editMessageText(t(lang, 'subscribe_choose_method'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card' }],
            [{ text: t(lang, 'btn_pay_robokassa'), callback_data: 'method_robokassa' }],
            [{ text: t(lang, 'btn_pay_crypto'), callback_data: 'method_crypto' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка subscribe:', err);
    }
  });

  // Из уведомления — новое сообщение
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'notify_subscribe') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      await bot.sendMessage(query.message.chat.id, t(lang, 'subscribe_choose_method'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card' }],
            [{ text: t(lang, 'btn_pay_robokassa'), callback_data: 'method_robokassa' }],
            [{ text: t(lang, 'btn_pay_crypto'), callback_data: 'method_crypto' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
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

      const lang = user.lang;

      await bot.sendMessage(msg.chat.id, t(lang, 'subscribe_choose_method'), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card' }],
            [{ text: t(lang, 'btn_pay_robokassa'), callback_data: 'method_robokassa' }],
            [{ text: t(lang, 'btn_pay_crypto'), callback_data: 'method_crypto' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });
    } catch (err) {
      console.error('❌ Ошибка /subscribe:', err);
    }
  });

  // ===== ШАГ 2: Выбрал метод → список планов =====

  // Карта РФ (RioPay) → все планы
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_card') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const { text, buttons } = await buildPlanButtons(lang, 'ru', 'pay_card');

      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + text + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_card:', err);
    }
  });

  // Visa/Mastercard (Robokassa) → без месячного
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_robokassa') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const roboRegion = user.region === 'ru' ? 'ru' : user.region === 'uae' ? 'uae' : 'tr';
      const { text, buttons } = await buildPlanButtons(lang, roboRegion, 'pay_robokassa', true);

      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + text + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_robokassa:', err);
    }
  });

  // Крипта (CryptoPay) → все планы
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_crypto') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const cryptoRegion = user.region === 'uae' ? 'crypto_uae' : 'crypto';
      const { text, buttons } = await buildPlanButtons(lang, cryptoRegion, 'pay_crypto');

      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + text + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_crypto:', err);
    }
  });

  // ===== ШАГ 3: Оплата =====

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

      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: 'RUB',
        method: 'card',
        status: 'pending',
      });

      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      const result = await createOrder({
        amount: price.price,
        currency: 'RUB',
        externalId: `pay_${payment.id}`,
        externalUserId: `user_${user.id}`,
        purpose: `Rocky VPN — ${planName}`,
      });

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
              [{ text: t(lang, 'btn_back'), callback_data: 'method_card' }],
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

  // Оплата через Robokassa (Visa/Mastercard)
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_robokassa_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';
      const planId = parseInt(query.data.replace('pay_robokassa_', ''), 10);

      const roboRegion = user.region === 'ru' ? 'ru' : user.region === 'uae' ? 'uae' : 'tr';

      const plan = await Plan.findOne({
        where: { id: planId },
        include: [{ model: PlanPrice, where: { region: roboRegion } }],
      });

      if (!plan || !plan.PlanPrices[0]) {
        await bot.answerCallbackQuery(query.id, {
          text: t(lang, 'subscribe_payment_stub'),
          show_alert: true,
        });
        return;
      }

      const price = plan.PlanPrices[0];

      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: price.currency,
        method: 'robokassa',
        status: 'pending',
      });

      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      const payUrl = generatePaymentUrl({
        invoiceId: payment.id,
        amount: price.price,
        description: `Rocky Network — ${planName}`,
        userId: user.id,
        planId,
      });

      const { formatted, symbol } = formatPrice(price.price, price.currency);

      await bot.editMessageText(
        t(lang, 'payment_card_invoice', { plan: planName, amount: formatted, currency: symbol }),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_pay_card_link'), url: payUrl }],
              [{ text: t(lang, 'btn_back'), callback_data: 'method_robokassa' }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_robokassa:', err);
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

      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: 'USD',
        method: 'crypto',
        status: 'pending',
      });

      const invoice = await createInvoice({
        amount: price.price,
        userId: user.id,
        planId,
        chatId: query.message.chat.id,
      });

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
              [{ text: t(lang, 'btn_back'), callback_data: 'method_crypto' }],
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
