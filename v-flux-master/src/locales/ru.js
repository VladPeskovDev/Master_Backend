module.exports = {
  // Start
  welcome: '👋 Добро пожаловать в V-Flux VPN!\n\nБыстрый и безопасный VPN для вашей приватности.\n\n🎁 У вас 3 дня бесплатного доступа!',
  welcome_back: '👋 С возвращением, {name}!',
  referral_registered: '👤 Вы зарегистрированы по приглашению друга!',

  // Main menu
  main_menu: '📱 Главное меню:',
  btn_connect: '🔑 Подключить VPN',
  btn_account: '📊 Мой аккаунт',
  btn_subscribe: '💳 Подписка',
  btn_referral: '👥 Пригласить друга',
  btn_language: '🌐 Язык',
  btn_help: '❓ Помощь',
  btn_back: '◀️ Назад',

  // Connect
  connect_title: '🔑 Подключение к VPN',
  connect_your_link: '📎 Ваша ссылка для подключения:\n\n<code>{link}</code>\n\nСкопируйте и вставьте в приложение.',
  connect_choose_platform: '📱 Выберите вашу платформу:',
  btn_ios: '📱 iOS (iPhone/iPad)',
  btn_android: '🤖 Android',
  btn_desktop: '💻 Desktop',
  btn_show_qr: '📷 QR-код',
  connect_ios: '📱 <b>Инструкция для iOS:</b>\n\n1. Скачайте <b>V2Box</b> или <b>Streisand</b> из App Store\n2. Откройте приложение → Configs → +\n3. Выберите "Add Subscription"\n4. Вставьте вашу ссылку\n5. Нажмите Connect ✅',
  connect_android: '🤖 <b>Инструкция для Android:</b>\n\n1. Скачайте <b>v2rayNG</b> из Google Play\n2. Нажмите + → Import from clipboard\n3. Или отсканируйте QR-код\n4. Нажмите подключиться ✅\n\n⚠️ Включите автообновление подписки в настройках!',
  connect_desktop: '💻 <b>Инструкция для Desktop:</b>\n\n<b>Windows:</b> V2RayN\n<b>macOS:</b> V2Box / Streisand\n<b>Linux:</b> Nekoray\n\n1. Скачайте клиент\n2. Добавьте подписку по ссылке\n3. Выберите сервер и подключитесь ✅',
  connect_no_sub: '❌ У вас нет активной подписки.\n\nНажмите 💳 Подписка чтобы приобрести.',

  // Account
  account_title: '📊 <b>Мой аккаунт</b>',
  account_plan: '📦 Тариф: <b>{plan}</b>',
  account_status_active: '✅ Статус: <b>Активна</b>',
  account_status_expired: '❌ Статус: <b>Истекла</b>',
  account_expires: '📅 Действует до: <b>{date}</b>',
  account_days_left: '⏳ Осталось: <b>{days} дн.</b>',
  account_traffic: '📊 Трафик: <b>{used} / {limit}</b>',
  account_traffic_unlimited: '📊 Трафик: <b>Безлимитный ♾️</b>',
  account_no_sub: '❌ Нет активной подписки',
  account_id: '🆔 ID: <code>{id}</code>',

  // Subscribe
  subscribe_title: '💳 <b>Выберите тариф:</b>',
  subscribe_plan: '{icon} <b>{name}</b>\n⏱ {days} дн. | 💰 {price} {currency}',
  btn_plan_monthly: '📅 1 месяц',
  btn_plan_semi: '📅 6 месяцев',
  btn_plan_annual: '📅 1 год',
  subscribe_choose_payment: '💳 Выберите способ оплаты:',
  btn_pay_card: '💳 Карта',
  btn_pay_stars: '⭐ Telegram Stars',
  subscribe_payment_stub: '🚧 Оплата скоро будет доступна!',

  // Referral
  referral_title: '👥 <b>Пригласите друга</b>',
  referral_description: '🎁 Пригласите друга и получите <b>1 месяц бесплатно + 100 ГБ</b> когда друг оплатит подписку!',
  referral_your_link: '🔗 Ваша ссылка:\n<code>{link}</code>',
  referral_stats: '👤 Приглашено: <b>{count}</b>\n🎁 Получено дней: <b>{days}</b>',


  btn_instruction: '📖 Инструкция',
  instruction_title: '📖 <b>Как подключить V-Flux VPN</b>',
  instruction_choose: '📱 Выберите вашу платформу:',
  instruction_ios: '📱 <b>iOS (iPhone / iPad)</b>\n\n1. Скачайте <b>V2Box</b> или <b>Streisand</b> из App Store\n2. Нажмите 🔑 Подключить VPN в боте\n3. Скопируйте ссылку\n4. В приложении: + → Add Subscription → вставьте ссылку\n5. Нажмите Connect ✅\n\n⚠️ Подписка обновляется автоматически каждый час',
  instruction_android: '🤖 <b>Android</b>\n\n1. Скачайте <b>v2rayNG</b> из Google Play\n2. Нажмите 🔑 Подключить VPN в боте\n3. Скопируйте ссылку или отсканируйте QR\n4. В приложении: + → Import from clipboard\n5. Нажмите подключиться ✅\n\n⚠️ Включите автообновление подписки в настройках',
  instruction_desktop: '💻 <b>Desktop</b>\n\n<b>Windows:</b> V2RayN\n<b>macOS:</b> V2Box / Streisand\n<b>Linux:</b> Nekoray\n\n1. Скачайте клиент для вашей ОС\n2. Нажмите 🔑 Подключить VPN в боте\n3. Скопируйте ссылку\n4. Добавьте подписку по ссылке\n5. Выберите сервер → подключитесь ✅',

  // Help
  help_title: '❓ <b>Помощь</b>',
  help_text: '🔑 <b>Как подключиться?</b>\nНажмите "Подключить VPN" и следуйте инструкции.\n\n📱 <b>Какое приложение скачать?</b>\niOS → V2Box / Streisand\nAndroid → v2rayNG\nDesktop → V2RayN / Nekoray\n\n💳 <b>Как оплатить?</b>\nНажмите "Подписка" и выберите тариф.\n\n❌ <b>VPN не работает?</b>\nОбновите подписку в приложении.\n\n📧 <b>Поддержка:</b>\n@vflux_support',

  // Language
  select_language: '🌐 Выберите язык:',
  language_set: '✅ Язык изменён на Русский',

  // General
  stub: '🚧 Раздел в разработке',
};