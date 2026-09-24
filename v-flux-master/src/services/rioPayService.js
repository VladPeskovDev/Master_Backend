const axios = require('axios');
const crypto = require('crypto');

const API_TOKEN = process.env.RIOPAY_API_TOKEN;
const BASE_URL = 'https://api.riopay.online/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Api-Token': API_TOKEN,
    'Content-Type': 'application/json',
  },
});

const DOMAIN = process.env.DOMAIN || 'https://chess-online24.art';

const createOrder = async ({ amount, currency, externalId, externalUserId, purpose }) => {
  const res = await api.post('/orders', {
    amount: String(amount),
    currency: currency || 'RUB',
    externalId,
    externalUserId,
    purpose: purpose || 'Rocky VPN',
    successUrl: `${DOMAIN}/api/riopay/success`,
    failUrl: `${DOMAIN}/api/riopay/fail`,
  });

  return {
    orderId: res.data.id,
    paymentLink: res.data.paymentLink,
    status: res.data.status,
  };
};

const verifySignature = (rawBody, signature) => {
  const hmac = crypto.createHmac('sha512', API_TOKEN);
  hmac.update(rawBody);
  return hmac.digest('hex') === signature;
};

// RioPay может слать вебхуки с разных IP — держим оба (при смене добавлять сюда).
const ALLOWED_IPS = ['82.146.51.110', '31.57.13.247'];

const isAllowedIp = (ip) => {
  const clean = ip.replace('::ffff:', '');
  return ALLOWED_IPS.includes(clean);
};

module.exports = { createOrder, verifySignature, isAllowedIp };
