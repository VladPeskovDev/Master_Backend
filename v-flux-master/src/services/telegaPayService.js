const axios = require('axios');

//const BASE_URL = 'https://testapp.telegapay.pro/api/v1';
//const API_KEY = process.env.TELEGAPAY_API_KEY_TEST;

const BASE_URL = process.env.TELEGAPAY_BASE_URL;
const API_KEY = process.env.TELEGAPAY_API_KEY;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-API-Key': API_KEY },
});

const createPaylink = async ({ amount, orderId, userId }) => {
  const res = await api.post('/create_paylink', {
    amount,
    currency: 'RUB',
    order_id: orderId,
    description: 'RockyVPN подписка',
    user_id: String(userId),
  });

  return {
    transactionId: res.data.transaction_id,
    paymentUrl: res.data.payment_url,
    status: res.data.status,
  };
};

const verifyWebhook = (headerApiKey) => {
  return headerApiKey === API_KEY;
};

module.exports = { createPaylink, verifyWebhook };
