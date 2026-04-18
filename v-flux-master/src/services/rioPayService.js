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
  console.log(`🔑 RioPay token: ${API_TOKEN ? API_TOKEN.substring(0, 6) + '...' : 'EMPTY'}`);

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

const ALLOWED_IP = '82.146.51.110';

const isAllowedIp = (ip) => {
  const clean = ip.replace('::ffff:', '');
  return clean === ALLOWED_IP;
};

module.exports = { createOrder, verifySignature, isAllowedIp };
