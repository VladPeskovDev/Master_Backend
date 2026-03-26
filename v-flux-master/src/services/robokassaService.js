const crypto = require('crypto');

const MERCHANT_LOGIN = process.env.ROBO_MERCHANT_LOGIN;
const PASSWORD_1 = process.env.ROBO_PASSWORD_1;
const PASSWORD_2 = process.env.ROBO_PASSWORD_2;

const DOMAIN = process.env.DOMAIN || 'https://chess-online24.art';

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

const generatePaymentUrl = ({ invoiceId, amount, currency, description, userId, planId }) => {
  const shpParams = { planId, userId };
  const shpSorted = Object.keys(shpParams)
    .sort()
    .map((key) => `Shp_${key}=${shpParams[key]}`);

  // Если валюта не RUB — включаем OutSumCurrency в подпись
  const outSumCurrency = currency && currency !== 'RUB' ? currency : null;
  let baseString = outSumCurrency
    ? `${MERCHANT_LOGIN}:${amount}:${invoiceId}:${outSumCurrency}:${PASSWORD_1}:${shpSorted.join(':')}`
    : `${MERCHANT_LOGIN}:${amount}:${invoiceId}:${PASSWORD_1}:${shpSorted.join(':')}`;
  const signature = md5(baseString).toUpperCase();

  let url = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  url += `?MerchantLogin=${MERCHANT_LOGIN}`;
  url += `&OutSum=${amount}`;
  url += `&InvId=${invoiceId}`;
  url += `&Description=${encodeURIComponent(description)}`;
  url += `&SignatureValue=${signature}`;
  if (outSumCurrency) {
    url += `&OutSumCurrency=${outSumCurrency}`;
  }
  shpSorted.forEach((pair) => {
    const [key, value] = pair.split('=');
    url += `&${key}=${value}`;
  });

  return url;
};

const verifyResult = ({ OutSum, InvId, SignatureValue, shpParams }) => {
  const shpSorted = Object.keys(shpParams)
    .filter((k) => k.startsWith('Shp_'))
    .sort()
    .map((key) => `${key}=${shpParams[key]}`);

  const baseString = `${OutSum}:${InvId}:${PASSWORD_2}:${shpSorted.join(':')}`;
  const expected = md5(baseString).toUpperCase();

  return expected === SignatureValue.toUpperCase();
};

module.exports = { generatePaymentUrl, verifyResult };
