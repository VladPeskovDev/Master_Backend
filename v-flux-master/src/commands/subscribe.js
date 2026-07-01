const { User, Plan, PlanPrice, Payment } = require('../../db/models');
const { t } = require('../locales');
const { createInvoice } = require('../services/oxaPayService');
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
const buildPlanButtons = async (lang, region, callbackPrefix, excludeMonthly = false, minPrice = 0) => {
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
    const rawPrice = isCents ? price.price / 100 : price.price;
    const displayPrice = minPrice > 0 ? Math.max(rawPrice, minPrice) : rawPrice;
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
            // [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card_robo' }], // Робокасса рубли — резерв
            [{ text: t(lang, 'btn_pay_mir'), callback_data: 'method_mir' }],
            [{ text: t(lang, 'btn_pay_visa'), callback_data: 'method_visa' }],
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
            // [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card_robo' }], // Робокасса рубли — резерв
            [{ text: t(lang, 'btn_pay_mir'), callback_data: 'method_mir' }],
            [{ text: t(lang, 'btn_pay_visa'), callback_data: 'method_visa' }],
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
            // [{ text: t(lang, 'btn_pay_card'), callback_data: 'method_card_robo' }], // Робокасса рубли — резерв
            [{ text: t(lang, 'btn_pay_mir'), callback_data: 'method_mir' }],
            [{ text: t(lang, 'btn_pay_visa'), callback_data: 'method_visa' }],
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

  /* Робокасса рубли — резерв
  // Карта РФ через Робокассу (рубли) — замена RioPay
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_card_robo') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const { text, buttons } = await buildPlanButtons(lang, 'ru', 'pay_card_robo');

      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + text + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_card_robo:', err);
    }
  });
  */

  // МИР (Robokassa, USD) → все планы из БД
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_mir') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const mirRegion = user.region === 'uae' ? 'uae' : 'tr';
      const { text, buttons } = await buildPlanButtons(lang, mirRegion, 'pay_mir');

      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + text + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_mir:', err);
    }
  });

  // Visa/Mastercard (Robokassa, USD) → спецпланы
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'method_visa') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const isUae = user.region === 'uae';

      // Спецпланы для Visa/MC (хардкод, минимум $6)
      const visaPlans = isUae
        ? [
          // { label: '📅 3 месяца — $7', callback: 'pay_visa_3mo_7' },
          { label: '🔥 6 месяцев — $20', callback: 'pay_visa_semi_20' },
          { label: '👑 12 месяцев — $40', callback: 'pay_visa_annual_40' },
        ]
        : [
          // { label: '📅 3 месяца — $7', callback: 'pay_visa_3mo_7' },
          { label: '🔥 6 месяцев — $10', callback: 'pay_visa_semi_10' },
          { label: '👑 12 месяцев — $20', callback: 'pay_visa_annual_20' },
        ];

      const buttons = visaPlans.map((p) => [{ text: p.label, callback_data: p.callback }]);
      buttons.push([{ text: t(lang, 'btn_back'), callback_data: 'subscribe' }]);

      await bot.editMessageText(t(lang, 'subscribe_title') + '\n\n' + t(lang, 'subscribe_footer'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка method_visa:', err);
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

  /* Робокасса рубли оплата — резерв
  // Оплата картой РФ через Робокассу (рубли) — замена RioPay
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_card_robo_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';
      const planId = parseInt(query.data.replace('pay_card_robo_', ''), 10);

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
              [{ text: t(lang, 'btn_back'), callback_data: 'method_card_robo' }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_card_robo:', err);
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
  */

  // Оплата МИР через Robokassa (USD из БД)
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_mir_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';
      const planId = parseInt(query.data.replace('pay_mir_', ''), 10);

      const mirRegion = user.region === 'uae' ? 'uae' : 'tr';

      const plan = await Plan.findOne({
        where: { id: planId },
        include: [{ model: PlanPrice, where: { region: mirRegion } }],
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
        method: 'mir',
        status: 'pending',
      });

      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      const payUrl = generatePaymentUrl({
        invoiceId: payment.id,
        amount: price.price,
        currency: 'USD',
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
              [{ text: t(lang, 'btn_back'), callback_data: 'method_mir' }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_mir:', err);
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

  // Оплата Visa/Mastercard через Robokassa (спецпланы, USD)
  bot.on('callback_query', async (query) => {
    try {
      if (!query.data.startsWith('pay_visa_')) return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang || 'en';

      // Парсим спецплан: pay_visa_3mo_6, pay_visa_semi_10, pay_visa_annual_20
      const visaData = query.data.replace('pay_visa_', '');
      let amount, days, trafficMultiplier, planLabel;

      // Находим Monthly план для расчёта трафика
      const monthlyPlan = await Plan.findOne({ where: { name: 'Monthly', active: true } });
      const monthlyTraffic = monthlyPlan ? Number(monthlyPlan.traffic_limit_bytes) : 161061273600;

      if (visaData === '3mo_7') {
        amount = 7; days = 90; trafficMultiplier = 3; planLabel = '3 months';
      } else if (visaData === 'semi_10') {
        amount = 10; days = 180; trafficMultiplier = 6; planLabel = '6 months';
      } else if (visaData === 'semi_20') {
        amount = 20; days = 180; trafficMultiplier = 6; planLabel = '6 months';
      } else if (visaData === 'annual_20') {
        amount = 20; days = 365; trafficMultiplier = 12; planLabel = '1 year';
      } else if (visaData === 'annual_40') {
        amount = 40; days = 365; trafficMultiplier = 12; planLabel = '1 year';
      } else {
        return;
      }

      // Ищем реальный план по длительности (Semi-Annual / Annual), Monthly — fallback
      const targetPlan = await Plan.findOne({ where: { duration_days: days, active: true } });
      const paymentPlanId = targetPlan?.id || monthlyPlan?.id || 2;

      const payment = await Payment.create({
        user_id: user.id,
        plan_id: paymentPlanId,
        amount,
        currency: 'USD',
        method: 'visa',
        status: 'pending',
        // Сохраним доп.данные в provider_id временно
      });

      // Сохраняем спецданные в payment для обработки в вебхуке
      await payment.update({ provider_id: `visa_${days}_${trafficMultiplier}_${payment.id}` });

      const payUrl = generatePaymentUrl({
        invoiceId: payment.id,
        amount,
        currency: 'USD',
        description: `Rocky Network — ${planLabel}`,
        userId: user.id,
        planId: paymentPlanId,
      });

      await bot.editMessageText(
        t(lang, 'payment_card_invoice', { plan: planLabel, amount, currency: '$' }),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_pay_card_link'), url: payUrl }],
              [{ text: t(lang, 'btn_back'), callback_data: 'method_visa' }],
            ],
          },
        },
      );

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка pay_visa:', err);
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

  // Оплата криптой через OxaPay
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
      // Цены в центах → доллары для OxaPay
      const amountUsd = (price.price / 100).toFixed(2);

      const payment = await Payment.create({
        user_id: user.id,
        plan_id: planId,
        amount: price.price,
        currency: 'USD',
        method: 'crypto',
        status: 'pending',
      });

      const planNameKey = PLAN_NAME_KEYS[plan.name] || 'plan_name_monthly';
      const planName = t(lang, planNameKey, { days: plan.duration_days });

      const invoice = await createInvoice({
        amount: amountUsd,
        orderId: `pay_${payment.id}`,
        userId: user.id,
        planId,
        description: `Rocky Network — ${planName}`,
      });

      await payment.update({ provider_id: invoice.trackId });

      await bot.editMessageText(
        t(lang, 'payment_crypto_invoice', { plan: planName, amount: amountUsd }),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_pay_crypto_link'), url: invoice.paymentUrl }],
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
