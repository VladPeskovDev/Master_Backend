const { User, Subscription, Plan } = require('../../db/models');
const { t } = require('../locales');
const { showMainMenu } = require('./menu');
const { addUserToAllNodes } = require('../services/nodeService');

const setupConnectHandler = (bot) => {
  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'connect') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const lang = user.lang;
      let sub = await Subscription.findOne({ where: { user_id: user.id, active: true } });

      // Нет подписки — активируем триал
      if (!sub) {
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

          console.log(`🎁 Триал активирован: ${user.uuid} (${user.username || user.telegram_id})`);
        } else {
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
      }

      const link = `${process.env.DOMAIN}/sub/${user.sub_token}`;

      await bot.editMessageText(t(lang, 'connect_your_link', { link }), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Скопировать ссылку', copy_text: { text: link } }],
            [{ text: t(lang, 'btn_ios'), callback_data: 'instruction_ios' }],
            [{ text: t(lang, 'btn_android'), callback_data: 'instruction_android' }],
            [{ text: t(lang, 'btn_desktop'), callback_data: 'instruction_desktop' }],
            [{ text: t(lang, 'btn_show_qr'), callback_data: 'show_qr' }],
            [{ text: t(lang, 'btn_back'), callback_data: 'back_to_menu' }],
          ],
        },
      });

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('❌ Ошибка connect:', err);
    }
  });

  ['ios', 'android', 'desktop'].forEach((platform) => {
    bot.on('callback_query', async (query) => {
      try {
        if (query.data !== `instruction_${platform}`) return;

        const user = await User.findOne({ where: { telegram_id: query.from.id } });
        if (!user) return;

        await bot.editMessageText(t(user.lang, `connect_${platform}`), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(user.lang, 'btn_back'), callback_data: 'connect' }],
            ],
          },
        });

        await bot.answerCallbackQuery(query.id);
      } catch (err) {
        console.error(`❌ Ошибка instruction_${platform}:`, err);
      }
    });
  });

  bot.on('callback_query', async (query) => {
    try {
      if (query.data !== 'show_qr') return;

      const user = await User.findOne({ where: { telegram_id: query.from.id } });
      if (!user) return;

      const QRCode = require('qrcode');
      const link = `${process.env.DOMAIN}/sub/${user.sub_token}`;
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