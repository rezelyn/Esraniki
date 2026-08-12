const store = require('../utils/settings');

const GLOBAL_DEFAULTS = {
    debug: false
};

const GUILD_DEFAULTS = {
    language: 'en_us',
    timezone: 'UTC+1',
    use24h: true
};

function toIanaZone(value) {
    const match = /^UTC([+-]\d{1,2})$/.exec(value || '');
    if (!match) return 'UTC';
    const offset = parseInt(match[1], 10);
    const inverted = -offset;
    if (inverted === 0) return 'UTC';
    return `Etc/GMT${inverted > 0 ? '+' + inverted : inverted}`;
}

function getDebug() {
    return store.get('debug', GLOBAL_DEFAULTS.debug);
}

function setDebug(value) {
    store.set('debug', value);
}

function getGuildSettings(guildId) {
    return { ...GUILD_DEFAULTS, ...store.getAll(guildId) };
}

function updateGuildSettings(guildId, patch) {
    return store.update(patch, guildId);
}

function getTimezone(guildId) {
    return store.get('timezone', GUILD_DEFAULTS.timezone, guildId);
}

function getUse24h(guildId) {
    return store.get('use24h', GUILD_DEFAULTS.use24h, guildId);
}

function getLanguage(guildId) {
    return store.get('language', GUILD_DEFAULTS.language, guildId);
}

function setLanguage(value, guildId) {
    store.set('language', value, guildId);
}

module.exports = {
    GLOBAL_DEFAULTS,
    GUILD_DEFAULTS,
    toIanaZone,
    getDebug,
    setDebug,
    getGuildSettings,
    updateGuildSettings,
    getTimezone,
    getUse24h,
    getLanguage,
    setLanguage
};
