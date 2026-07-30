const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { handleError } = require('./errorHandler');
const settings = require('./settings');

const supported = ['en_us', 'fr_fr'];
const DISCORD_LOCALE = {
    en_us: 'en-US',
    fr_fr: 'fr'
};

let current = settings.get('language', 'en_us');

const strings = {};
for (const locale of supported) {
    strings[locale] = require(path.join(__dirname, '../lang', `${locale}.json`));
}

function resolve(object, key) {
    return key.split('.').reduce((o, k) => o?.[k], object);
}

function settingsFile(guildId) {
    return path.join(__dirname, '../../data', guildId, 'settings.json');
}

async function getSettings(guildId) {
    try {
        const file = settingsFile(guildId);
        try {
            await fs.promises.access(file);
            const data = await fs.promises.readFile(file, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return {};
            }
            throw err;
        }
    } catch (err) {
        handleError(err, `Reading guild settings for ${guildId}`);
        return {};
    }
}

async function setSettings(guildId, data) {
    try {
        const file = settingsFile(guildId);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, `Writing guild settings for ${guildId}`);
    }
}

async function locale(key, vars = {}, guildId) {
    const locale = guildId ? await getLanguage(guildId) : current;
    let value = resolve(strings[locale], key) ?? resolve(strings['en_us'], key);
    if (value === undefined) return key;
    return Object.entries(vars).reduce(
        (string, [key, value]) => string.replaceAll(`{${key}}`, value),
        value
    );
}

async function setLanguage(locale, guildId) {
    if (!supported.includes(locale))
        throw new Error(`Unsupported language: ${locale}`);
    if (guildId) {
        await setSettings(guildId, {
            ...(await getSettings(guildId)),
            language: locale
        });
        logger.info(`Language set to ${locale} for guild ${guildId}`);
        return;
    }
    current = locale;
    settings.set('language', locale);
    logger.info(`Global language set to ${locale}`);
}

async function getLanguage(guildId) {
    if (guildId) return (await getSettings(guildId)).language ?? 'en_us';
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
    supported,
};
