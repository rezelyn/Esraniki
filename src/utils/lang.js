const path = require('path');
const settings = require('./settings');

const supported = ['en_us', 'fr_fr'];

let current = settings.get('language', 'en_us');

const strings = {};
for (const locale of supported) {
  strings[locale] = require(path.join(__dirname, '../lang', `${locale}.json`));
}

function resolve(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj);
}

function t(key, vars = {}) {
  let value = resolve(strings[current], key) ?? resolve(strings['en_us'], key);
  if (value === undefined) return key;
  return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{${k}}`, v), value);
}

function setLanguage(locale) {
  if (!supported.includes(locale)) throw new Error(`Unsupported language: ${locale}`);
  current = locale;
  settings.set('language', locale);
}

function getLanguage() {
  return current;
}

const DISCORD_LOCALE = {
  en_us: 'en-US',
  fr_fr: 'fr'
};

function getLocalizations(key) {
  const result = {};
  for (const locale of supported) {
    const value = resolve(strings[locale], key);
    if (value !== undefined) result[DISCORD_LOCALE[locale]] = value;
  }
  return result;
}

module.exports = { t, setLanguage, getLanguage, getLocalizations, supported };
