const path = require('path');
const logger = require('./logger');
const appSettings = require('../app/settings');

const supported = ['en_us', 'fr_fr'];
const DISCORD_LOCALE = { en_us: 'en-US', fr_fr: 'fr' };

const strings = {};
for (const locale of supported) {
    strings[locale] = require(path.join(__dirname, '../lang', `${locale}.json`));
}

function resolve(object, key) {
    return key.split('.').reduce((o, k) => o?.[k], object);
}

async function locale(key, vars = {}, guildId) {
    const localeCode = guildId ? appSettings.getLanguage(guildId) : appSettings.GUILD_DEFAULTS.language;
    let value = resolve(strings[localeCode], key) ?? resolve(strings['en_us'], key);
    if (value === undefined) return key;
    return Object.entries(vars).reduce(
        (string, [k, v]) => string.replaceAll(`{${k}}`, v),
        value
    );
}

async function setLanguage(locale, guildId) {
    if (!supported.includes(locale))
        throw new Error(`Unsupported language: ${locale}`);
    if (!guildId) {
        logger.warn('lang.setLanguage called without a guildId; there is no global language setting to update');
        return;
    }
    appSettings.setLanguage(locale, guildId);
    logger.info(`(Guild ${guildId}) Language set to ${locale}`);
}

async function getLanguage(guildId) {
    return guildId ? appSettings.getLanguage(guildId) : appSettings.GUILD_DEFAULTS.language;
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
