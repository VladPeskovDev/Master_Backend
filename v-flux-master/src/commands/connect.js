const { User, Subscription, Plan } = require('../../db/models');
const { t } = require('../locales');
const { addUserToAllNodes } = require('../services/nodeService');

const APP_URLS = {
  v2box_ios: 'https://apps.apple.com/app/v2box-v2ray-client/id6446814690',
  v2box_android: 'https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box',
  v2raytun: 'https://play.google.com/store/apps/details?id=com.v2raytun.android',
  v2rayn: 'https://github.com/2dust/v2rayN/releases',
  v2box_macos: 'https://apps.apple.com/app/v2box-v2ray-client/id6446814690',
  v2raya: 'https://github.com/v2rayA/v2rayA/releases',
  happ_ios: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973',
  happ_by: 'https://apps.apple.com/by/app/happ-proxy-utility/id6504287215',
  v2box_uz: 'https://apps.apple.com/uz/app/v2box-v2ray-client/id6446814690',
};

const getDeviceKeyboard = (lang) => ({
  inline_keyboard: [
    [{ text: t(lang, 'btn_iphone'), callback_data: 'platform_ios' }],
    [{ text: t(lang, 'btn_android_device'), callback_data: 'platform_android' }],
    [{ text: t(lang, 'btn_computer'), callback_data: 'platform_desktop' }],
    [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
  ],
});

const getPlatformKeyboard = (lang, link, downloadBtn, downloadUrl, backCallback) => ({
  inline_keyboard: [
    [{ text: t(lang, downloadBtn), url: downloadUrl }],
    [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
    [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
    [{ text: t(lang, 'btn_back'), callback_data: backCallback }],
  ],
});

// Защита от двойного нажатия при создании триала
const trialLock = new Set();

const setupConnectHandler = (bot) => {
  // === Экран 1: connect → создание триала + выбор устройства ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'connect') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      let sub = await Subscription.findOne({ where: { user_id: user.id, active: true } });
      let justActivated = false;

      // Нет подписки — активируем триал
      if (!sub) {
        // Защита от race condition
        if (trialLock.has(user.id)) {
          await bot.answerCallbackQuery(query.id);
          return;
        }
        trialLock.add(user.id);

        try {
          // Повторная проверка после лока
          sub = await Subscription.findOne({ where: { user_id: user.id, active: true } });
          if (sub) {
            trialLock.delete(user.id);
          } else {
            const trialPlan = await Plan.findOne({ where: { is_trial: true, active: true } });

            if (trialPlan) {
              sub = await Subscription.create({
                user_id: user.id,
                plan_id: trialPlan.id,
                started_at: new Date(),
                expires_at: new Date(Date.now() + trialPlan.duration_days * 24 * 60 * 60 * 1000),
                traffic_limit: trialPlan.traffic_limit_bytes,
                traffic_used: 0,
                throttled: false,
                active: true,
              });

              await addUserToAllNodes(user.uuid, Number(trialPlan.traffic_limit_bytes));
              justActivated = true;
              console.log(`🎁 Триал активирован: ${user.uuid} (${user.username || user.telegram_id})`);
            }
            trialLock.delete(user.id);
          }

          if (!sub) {
            // Нет триал-плана — предлагаем купить
            await bot.editMessageText(t(lang, 'connect_no_sub'), {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: t(lang, 'btn_subscribe'), callback_data: 'subscribe' }],
                  [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
                ],
              },
            });
            return bot.answerCallbackQuery(query.id);
          }
        } catch (lockErr) {
          trialLock.delete(user.id);
          throw lockErr;
        }
      }

      // Показываем экран выбора устройства
      const text = justActivated
        ? t(lang, 'connect_activated', { days: '3' })
        : t(lang, 'connect_choose_device');

      await bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: getDeviceKeyboard(lang),
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка connect:', err);
    }
  });

  // === Экран 2: iOS ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'platform_ios') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const link = `${process.env.SUB_DOMAIN || process.env.DOMAIN}/sub/${user.sub_token}`;

      let iosKeyboard;
      if (lang === 'ru') {
        iosKeyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn_download_happ'), url: APP_URLS.happ_ios }],
            [{ text: '🇧🇾 Скачать Happ (App Store Беларусь)', url: APP_URLS.happ_by }],
            [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'connect' }],
          ],
        };
      } else if (lang === 'uz') {
        iosKeyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn_download_v2box'), url: APP_URLS.v2box_uz }],
            [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'connect' }],
          ],
        };
      } else {
        iosKeyboard = getPlatformKeyboard(lang, link, 'btn_download_v2box', APP_URLS.v2box_ios, 'connect');
      }

      await bot.editMessageText(t(lang, 'connect_platform_ios', { link }), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: iosKeyboard,
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка platform_ios:', err);
    }
  });

  // === Экран 2: Android ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'platform_android') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const link = `${process.env.SUB_DOMAIN || process.env.DOMAIN}/sub/${user.sub_token}`;

      await bot.editMessageText(t(lang, 'connect_platform_android', { link }), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_download_v2box'), url: APP_URLS.v2box_android }],
            [{ text: t(lang, 'btn_download_v2raytun'), url: APP_URLS.v2raytun }],
            [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'connect' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка platform_android:', err);
    }
  });

  // === Экран 2: Desktop → выбор ОС ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'platform_desktop') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;

      await bot.editMessageText(t(lang, 'connect_desktop_choose'), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_windows'), callback_data: 'desktop_windows' }],
            [{ text: t(lang, 'btn_macos'), callback_data: 'desktop_macos' }],
            [{ text: t(lang, 'btn_linux'), callback_data: 'desktop_linux' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'connect' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка platform_desktop:', err);
    }
  });

  // === Экраны Desktop ОС: Windows, macOS, Linux ===
  const desktopPlatforms = [
    { callback: 'desktop_windows', textKey: 'connect_platform_windows', downloadBtn: 'btn_download_v2rayn', url: APP_URLS.v2rayn },
    { callback: 'desktop_linux', textKey: 'connect_platform_linux', downloadBtn: 'btn_download_v2raya', url: APP_URLS.v2raya },
  ];

  desktopPlatforms.forEach(({ callback, textKey, downloadBtn, url }) => {
    bot.on('callback_query', async (query) => {
      try {
        if (query.data !== callback) return;

        const user = await User.findOne({ where: { telegram_id: query.from.id } });
        if (!user) return;

        const lang = user.lang;
        const link = `${process.env.SUB_DOMAIN || process.env.DOMAIN}/sub/${user.sub_token}`;

        await bot.editMessageText(t(lang, textKey, { link }), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: getPlatformKeyboard(lang, link, downloadBtn, url, 'platform_desktop'),
        });

        await bot.answerCallbackQuery(query.id);
      } catch (err) {
        console.error(`❌ Ошибка ${callback}:`, err);
      }
    });
  });

  // === macOS — отдельно для RU (Happ + V2Box) ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'desktop_macos') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      const link = `${process.env.SUB_DOMAIN || process.env.DOMAIN}/sub/${user.sub_token}`;

      let macKeyboard;
      if (lang === 'ru') {
        macKeyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn_download_happ'), url: APP_URLS.happ_ios }],
            [{ text: '🇧🇾 Скачать Happ (App Store Беларусь)', url: APP_URLS.happ_by }],
            [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'platform_desktop' }],
          ],
        };
      } else if (lang === 'uz') {
        macKeyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn_download_v2box'), url: APP_URLS.v2box_uz }],
            [{ text: t(lang, 'btn_copy_link'), copy_text: { text: link } }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'platform_desktop' }],
          ],
        };
      } else {
        macKeyboard = getPlatformKeyboard(lang, link, 'btn_download_v2box', APP_URLS.v2box_macos, 'platform_desktop');
      }

      await bot.editMessageText(t(lang, 'connect_platform_macos', { link }), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: macKeyboard,
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка desktop_macos:', err);
    }
  });

  // === QR-код ===
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'show_qr') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const QRCode = require('qrcode');
      const link = `${process.env.SUB_DOMAIN || process.env.DOMAIN}/sub/${user.sub_token}`;
      const qrBuffer = await QRCode.toBuffer(link, { width: 300 });

      await bot.sendPhoto(query.message.chat.id, qrBuffer, {
        caption: '📷 QR-код для подключения',
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка show_qr:', err);
    }
  });
};

module.exports = setupConnectHandler;
