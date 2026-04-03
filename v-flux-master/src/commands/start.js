const crypto = require('crypto');
const { User, Subscription, Plan } = require('../../db/models');
const { t, detectLang } = require('../locales');
const { showMainMenu } = require('./menu');

const detectRegion = (languageCode) => {
  const regionMap = { ru: 'ru', tr: 'tr', uz: 'uz', ar: 'uae', hi: 'uae' };
  const short = (languageCode || '').toLowerCase().slice(0, 2);
  return regionMap[short] || 'uae';
};

const formatBytes = (bytes) => {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getMinimalKeyboard = (lang) => ({
  inline_keyboard: [
    [{ text: t(lang, 'btn_try_free'), callback_data: 'connect' }],
    [{ text: t(lang, 'btn_language'), callback_data: 'language' }],
  ],
});

const getExpiredKeyboard = (lang, isPaid) => ({
  inline_keyboard: [
    [{
      text: t(lang, isPaid ? 'btn_renew_subscription' : 'btn_get_subscription'),
      callback_data: 'subscribe',
    }],
    [{ text: t(lang, 'btn_referral_bonus'), callback_data: 'referral' }],
    [{ text: t(lang, 'btn_language'), callback_data: 'language' }],
  ],
});

const setupStartCommand = (bot) => {
  bot.onText(/\/start(.*)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id;
      const referralParam = match[1]?.trim();

      let user = await User.findOne({ where: { telegram_id: telegramId } });

      // === Юзер НЕ найден — создаём ===
      if (!user) {
        const lang = detectLang(msg.from.language_code);
        const region = detectRegion(msg.from.language_code);

        const uuid = crypto.randomUUID();
        const subToken = crypto.randomBytes(16).toString('hex');
        const referralCode = crypto.randomBytes(4).toString('hex');

        let referredBy = null;
        let source = null;

        if (referralParam) {
          if (referralParam.startsWith('ref_')) {
            const refCode = referralParam.replace('ref_', '');
            const referrer = await User.findOne({ where: { referral_code: refCode } });
            if (referrer) referredBy = referrer.id;
          } else if (referralParam.startsWith('src_')) {
            source = referralParam.replace('src_', '');
          }
        }

        user = await User.create({
          telegram_id: telegramId,
          username: msg.from.username || null,
          first_name: msg.from.first_name || null,
          last_name: msg.from.last_name || null,
          uuid,
          sub_token: subToken,
          lang,
          region,
          referral_code: referralCode,
          referred_by: referredBy,
          source,
        });

        // Сценарий Ж — новый по реферальной ссылке
        if (referredBy) {
          return bot.sendMessage(chatId, t(lang, 'welcome_new_referral'), {
            parse_mode: 'HTML',
            reply_markup: getMinimalKeyboard(lang),
          });
        }

        // Сценарий А — совсем новый
        return bot.sendMessage(chatId, t(lang, 'welcome_new'), {
          parse_mode: 'HTML',
          reply_markup: getMinimalKeyboard(lang),
        });
      }

      // === Юзер найден — определяем сценарий по подписке ===
      const lang = user.lang;

      const subscription = await Subscription.findOne({
        where: { user_id: user.id },
        include: [{ model: Plan, attributes: ['is_trial', 'traffic_limit_bytes'] }],
        order: [['createdAt', 'DESC']],
      });

      // Сценарий Б — был, не подключался (нет подписки вообще)
      if (!subscription) {
        return bot.sendMessage(chatId, t(lang, 'welcome_back_no_sub'), {
          parse_mode: 'HTML',
          reply_markup: getMinimalKeyboard(lang),
        });
      }

      const isTrial = subscription.Plan?.is_trial;
      const isActive = subscription.active;

      if (isActive && isTrial) {
        // Сценарий В — активный триал
        const text = t(lang, 'welcome_back_trial_active', {
          date: formatDate(subscription.expires_at),
          used: formatBytes(Number(subscription.traffic_used)),
          limit: formatBytes(Number(subscription.traffic_limit)),
        });
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        return showMainMenu(bot, chatId, lang);
      }

      if (!isActive && isTrial) {
        // Сценарий Г — триал истёк
        return bot.sendMessage(chatId, t(lang, 'welcome_back_trial_expired'), {
          parse_mode: 'HTML',
          reply_markup: getExpiredKeyboard(lang, false),
        });
      }

      if (isActive && !isTrial) {
        // Сценарий Д — активная платная
        const text = t(lang, 'welcome_back_paid_active', {
          date: formatDate(subscription.expires_at),
        });
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        return showMainMenu(bot, chatId, lang);
      }

      // Сценарий Е — платная истекла
      return bot.sendMessage(chatId, t(lang, 'welcome_back_paid_expired'), {
        parse_mode: 'HTML',
        reply_markup: getExpiredKeyboard(lang, true),
      });
    } catch (err) {
      console.error('❌ Ошибка в /start:', err);
      await bot.sendMessage(msg.chat.id, '❌ Error. Please try again.');
    }
  });
};

module.exports = setupStartCommand;
