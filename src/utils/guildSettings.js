const fs = require('fs');
const path = require('path');
const { handleError } = require('./errorHandler');

const DEFAULTS = {
    timezone: 'UTC+1',
    use24h: true
};

function file(guildId) {
    return path.join(__dirname, '../../data', guildId, 'settings.json');
}

function getAll(guildId) {
    if (!guildId) return {};
    try {
        const f = file(guildId);
        if (!fs.existsSync(f)) return {};
        return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (err) {
        handleError(err, `Reading guild settings for ${guildId}`);
        return {};
    }
}

function setAll(guildId, data) {
    if (!guildId) return;
    try {
        const f = file(guildId);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, `Writing guild settings for ${guildId}`);
    }
}

function update(guildId, patch) {
    const next = { ...getAll(guildId), ...patch };
    setAll(guildId, next);
    return next;
}

function getTimezone(guildId) {
    return getAll(guildId).timezone ?? DEFAULTS.timezone;
}

function getUse24h(guildId) {
    return getAll(guildId).use24h ?? DEFAULTS.use24h;
}

function toIanaZone(value) {
    const match = /^UTC([+-]\d{1,2})$/.exec(value || '');
    if (!match) return 'UTC';
    const offset = parseInt(match[1], 10);
    const inverted = -offset;
    if (inverted === 0) return 'UTC';
    return `Etc/GMT${inverted > 0 ? '+' + inverted : inverted}`;
}

module.exports = {
    getAll,
    setAll,
    update,
    getTimezone,
    getUse24h,
    toIanaZone,
    DEFAULTS
};
