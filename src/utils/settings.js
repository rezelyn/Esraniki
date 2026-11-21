const fs = require('fs');
const path = require('path');
const { handleError } = require('./errorHandler');

function resolveFile(guildId) {
    return guildId
        ? path.join(__dirname, '../../data', guildId, 'settings.json')
        : path.join(__dirname, '../../data/settings.json');
}

function getAll(guildId) {
    try {
        const file = resolveFile(guildId);
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        handleError(err, guildId ? `Loading settings for guild ${guildId}` : 'Loading settings');
        return {};
    }
}

function setAll(guildId, data) {
    try {
        const file = resolveFile(guildId);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        handleError(err, guildId ? `Saving settings for guild ${guildId}` : 'Saving settings');
        return false;
    }
}

function get(key, defaultValue, guildId) {
    return getAll(guildId)[key] ?? defaultValue;
}

function set(key, value, guildId) {
    return setAll(guildId, { ...getAll(guildId), [key]: value });
}

function update(patch, guildId) {
    const next = { ...getAll(guildId), ...patch };
    setAll(guildId, next);
    return next;
}

module.exports = {
    getAll,
    setAll,
    get,
    set,
    update
};
