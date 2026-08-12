const fs = require('fs');
const path = require('path');
const { handleError } = require('../../utils/errorHandler');
const settings = require('../settings');

function defaultConfig() {
    return {
        channelId: null,
        gifUrl: null,
        userLastSent: {},
        userStats: {},
        lastSentDate: null,
        lastSentBy: null,
        totalPasses: 0,
        todayPasses: 0
    };
}

function file(guildId) {
    return path.join(__dirname, '../../../data', guildId, 'games', 'shrimp.json');
}

function load(guildId) {
    if (!guildId) return defaultConfig();
    try {
        const f = file(guildId);
        if (!fs.existsSync(f)) return defaultConfig();
        return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (err) {
        handleError(err, `Loading shrimp config for Guild ${guildId}`);
        return defaultConfig();
    }
}

function save(data, guildId) {
    if (!guildId) return;
    try {
        const f = file(guildId);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, `Saving shrimp config for Guild ${guildId}`);
    }
}

function getConfig(guildId) {
    return load(guildId);
}

function setChannel(guildId, channelId) {
    const shrimp = load(guildId);
    shrimp.channelId = channelId;
    save(shrimp, guildId);
}

function setGif(guildId, gifUrl) {
    const shrimp = load(guildId);
    shrimp.gifUrl = gifUrl;
    save(shrimp, guildId);
}

function _shrimpDayKey(guildId) {
    const zone = settings.toIanaZone(settings.getTimezone(guildId));
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
}

function _msUntilNextReset(guildId) {
    const zone = settings.toIanaZone(settings.getTimezone(guildId));
    const now = new Date();

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(now).reduce((acc, part) => {
        if (part.type === 'hour') acc.hour = parseInt(part.value, 10) % 24;
        if (part.type === 'minute') acc.minute = parseInt(part.value, 10);
        if (part.type === 'second') acc.second = parseInt(part.value, 10);
        return acc;
    }, {});

    const elapsed = (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 + now.getMilliseconds();
    const DAY = 24 * 3600 * 1000;

    const remaining = DAY - elapsed;
    return remaining === 0 ? DAY : remaining;
}

function canUserSendToday(userId, guildId) {
    const shrimp = load(guildId);
    if (!shrimp.userLastSent) return true;
    const last = shrimp.userLastSent[userId];
    if (!last) return true;
    return last !== _shrimpDayKey(guildId);
}

function getUserCooldownRemaining(userId, guildId) {
    const shrimp = load(guildId);
    if (!shrimp.userLastSent) return 0;
    const last = shrimp.userLastSent[userId];
    if (!last) return 0;
    if (last !== _shrimpDayKey(guildId)) return 0;
    return _msUntilNextReset(guildId);
}

function getUsersOnCooldown(guildId) {
    const shrimp = load(guildId);
    const out = [];
    if (!shrimp.userLastSent) return out;
    const dayKey = _shrimpDayKey(guildId);
    for (const [userId, last] of Object.entries(shrimp.userLastSent)) {
        if (last === dayKey) out.push({ userId, remaining: _msUntilNextReset(guildId) });
    }
    return out;
}

function isGlobalSentToday(guildId) {
    const shrimp = load(guildId);
    return shrimp.lastSentDate === _shrimpDayKey(guildId);
}

function isUserOnCooldown(userId, guildId) {
    const shrimp = load(guildId);
    if (!shrimp.userLastSent) return false;
    return shrimp.userLastSent[userId] === _shrimpDayKey(guildId);
}

function recordGlobalSend(guildId, userId) {
    const shrimp = load(guildId);
    if (!shrimp.userLastSent) shrimp.userLastSent = {};
    if (!shrimp.userStats) shrimp.userStats = {};
    const dayKey = _shrimpDayKey(guildId);

    if (shrimp.lastSentDate === dayKey) {
        shrimp.todayPasses = (typeof shrimp.todayPasses === 'number' ? shrimp.todayPasses : 0) + 1;
    } else {
        shrimp.todayPasses = 1;
        shrimp.lastSentDate = dayKey;
    }

    shrimp.totalPasses = (typeof shrimp.totalPasses === 'number' ? shrimp.totalPasses : 0) + 1;
    shrimp.lastSentBy = userId;
    shrimp.userLastSent[userId] = dayKey;

    if (!shrimp.userStats[userId]) shrimp.userStats[userId] = { total: 0, today: 0, lastDate: null };
    const user = shrimp.userStats[userId];
    user.total = (typeof user.total === 'number' ? user.total : 0) + 1;
    user.today = user.lastDate === dayKey ? (typeof user.today === 'number' ? user.today : 0) + 1 : 1;
    user.lastDate = dayKey;

    save(shrimp, guildId);
}

function getUserStats(guildId) {
    return load(guildId).userStats || {};
}

module.exports = {
    getConfig,
    setChannel,
    setGif,
    canUserSendToday,
    isGlobalSentToday,
    isUserOnCooldown,
    recordGlobalSend,
    getUserCooldownRemaining,
    getUsersOnCooldown,
    getUserStats,
    getMsUntilReset: _msUntilNextReset
};
