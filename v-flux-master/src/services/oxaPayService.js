const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.OXAPAY_API_KEY;
const DOMAIN = process.env.DOMAIN || 'https://chess-online24.art';

const api = axios.create({
  baseURL: 'https://api.oxapay.com/v1',
  headers: {
    'merchant_api_key': API_KEY,
    'Content-Type': 'application/json',
  },
});

const createInvoice = async ({ amount, orderId, userId, planId, description }) => {
  const res = await api.post('/payment/invoice', {
    amount,
    currency: 'USD',
    order_id: orderId,
    callback_url: `${DOMAIN}/api/oxapay/webhook`,
    return_url: `${DOMAIN}/api/oxapay/success`,
    description: description || 'Rocky Network',
    fee_paid_by_payer: 1,
    lifetime: 60,
  });

  return {
    trackId: res.data.data.track_id,
    paymentUrl: res.data.data.payment_url,
  };
};

const verifySignature = (rawBody, signature) => {
  const hmac = crypto.createHmac('sha512', API_KEY).update(rawBody).digest('hex');
  return hmac === signature;
};

module.exports = { createInvoice, verifySignature };
