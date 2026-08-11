const path = require('path');
const logger = require('./logger');
const settings = require('./settings');
const guildSettings = require('./guildSettings');

const supported = ['en_us', 'fr_fr'];
const DISCORD_LOCALE = { en_us: 'en-US', fr_fr: 'fr' };

let current = settings.get('language', 'en_us');

const strings = {};
for (const locale of supported) {
    strings[locale] = require(path.join(__dirname, '../lang', `${locale}.json`));
}

function resolve(object, key) {
    return key.split('.').reduce((o, k) => o?.[k], object);
}

async function locale(key, vars = {}, guildId) {
    const locale = guildId ? await getLanguage(guildId) : current;
    let value = resolve(strings[locale], key) ?? resolve(strings['en_us'], key);
    if (value === undefined) return key;
    return Object.entries(vars).reduce(
        (string, [k, v]) => string.replaceAll(`{${k}}`, v),
        value
    );
}

async function setLanguage(locale, guildId) {
    if (!supported.includes(locale))
        throw new Error(`Unsupported language: ${locale}`);
    if (guildId) {
        guildSettings.update(guildId, { language: locale });
        logger.info(`(Guild ${guildId}) Language set to ${locale}`);
        return;
    }
    current = locale;
    settings.set('language', locale);
    logger.info(`(Global) Language set to ${locale}`);
}

async function getLanguage(guildId) {
    if (guildId) return guildSettings.getAll(guildId).language ?? 'en_us';
    return current;
}

function getLocalizations(key) {
    const result = {};
    for (const locale of supported) {
        const value = resolve(strings[locale], key);
        if (value !== undefined) result[DISCORD_LOCALE[locale]] = value;
    }
    return result;
}

function guildLocale(guildId) {
    return (key, vars = {}) => locale(key, vars, guildId);
}

module.exports = {
    locale,
    guildLocale,
    setLanguage,
    getLanguage,
    getLocalizations,
    supported
};
