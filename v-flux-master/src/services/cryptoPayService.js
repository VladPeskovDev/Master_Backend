const axios = require('axios');
const crypto = require('crypto');

const CRYPTOPAY_TOKEN = process.env.CRYPTOPAY_TOKEN;
const BASE_URL = 'https://pay.crypt.bot/api/';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Crypto-Pay-API-Token': CRYPTOPAY_TOKEN },
});

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'RockyVPN_bot';

const createInvoice = async ({ amount, userId, planId, chatId }) => {
  const res = await api.post('createInvoice', {
    currency_type: 'fiat',
    fiat: 'USD',
    amount: (amount / 100).toFixed(2), // центы → доллары
    accepted_assets: 'USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC',
    payload: JSON.stringify({ user_id: userId, plan_id: planId }),
    paid_btn_name: 'callback',
    paid_btn_url: `https://t.me/${BOT_USERNAME}`,
    allow_anonymous: true,
  });

  const invoice = res.data.result;
  return {
    invoice_id: invoice.invoice_id,
    bot_invoice_url: invoice.bot_invoice_url,
    mini_app_invoice_url: invoice.mini_app_invoice_url,
  };
};

const verifyWebhookSignature = (body, signature) => {
  const secret = crypto.createHash('sha256').update(CRYPTOPAY_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  return hash === signature;
};

module.exports = { createInvoice, verifyWebhookSignature };
