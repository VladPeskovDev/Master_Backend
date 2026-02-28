const crypto = require('crypto');
const { User, Plan, Subscription } = require('../../db/models');
const { t, detectLang } = require('../locales');
const { addUserToAllNodes } = require('../services/nodeService');
const { showMainMenu } = require('./menu');

const setupStartCommand = (bot) => {
  bot.onText(/\/start(.*)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id;
      const referralParam = match[1]?.trim();

      // Проверяем существующего юзера
      let user = await User.findOne({ where: { telegram_id: telegramId } });

      if (user) {
        const lang = user.lang;
        await bot.sendMessage(
          chatId,
          t(lang, 'welcome_back', { name: msg.from.first_name || 'User' }),
        );
        return showMainMenu(bot, chatId, lang);
      }

      // Определяем язык
      const lang = detectLang(msg.from.language_code);

      // Генерируем уникальные токены
      const uuid = crypto.randomUUID();
      const subToken = crypto.randomBytes(16).toString('hex');
      const referralCode = crypto.randomBytes(4).toString('hex');

      // Определяем реферера
      let referredBy = null;
      if (referralParam && referralParam.startsWith(' ref_')) {
        const refCode = referralParam.replace(' ref_', '');
        const referrer = await User.findOne({ where: { referral_code: refCode } });
        if (referrer) referredBy = referrer.id;
      }

      // Создаём юзера
      user = await User.create({
        telegram_id: telegramId,
        username: msg.from.username || null,
        first_name: msg.from.first_name || null,
        last_name: msg.from.last_name || null,
        uuid,
        sub_token: subToken,
        lang,
        referral_code: referralCode,
        referred_by: referredBy,
      });

      // Активируем триал
      const trialPlan = await Plan.findOne({ where: { is_trial: true, active: true } });

      if (trialPlan) {
        await Subscription.create({
          user_id: user.id,
          plan_id: trialPlan.id,
          started_at: new Date(),
          expires_at: new Date(Date.now() + trialPlan.duration_days * 24 * 60 * 60 * 1000),
          traffic_limit: trialPlan.traffic_limit_bytes,
          traffic_used: 0,
          throttled: false,
          active: true,
        });

        // Добавляем юзера на все ноды
        await addUserToAllNodes(uuid, Number(trialPlan.traffic_limit_bytes));
      }

      // Отправляем приветствие
      let welcomeText = t(lang, 'welcome');
      if (referredBy) {
        welcomeText += '\n\n' + t(lang, 'referral_registered');
      }

      await bot.sendMessage(chatId, welcomeText);
      return showMainMenu(bot, chatId, lang);
    } catch (err) {
      console.error('❌ Ошибка в /start:', err);
      await bot.sendMessage(msg.chat.id, '❌ Error. Please try again.');
    }
  });
};

module.exports = setupStartCommand;