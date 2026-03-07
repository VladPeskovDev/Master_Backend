const ru = require('./ru');
const en = require('./en');
const ar = require('./ar');
const uz = require('./uz');
const hi = require('./hi');
const tr = require('./tr');

const locales = { ru, en, ar, uz, hi, tr };

const SUPPORTED_LANGS = Object.keys(locales);

const t = (lang, key, params = {}) => {
  const locale = locales[lang] || locales.en;
  let text = locale[key] || locales.en[key] || key;

  Object.entries(params).forEach(([k, v]) => {
    text = text.replaceAll(`{${k}}`, v);
  });

  return text;
};

const detectLang = (languageCode) => {
  if (!languageCode) return 'en';
  const short = languageCode.toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.includes(short) ? short : 'en';
};

module.exports = { t, detectLang, SUPPORTED_LANGS };