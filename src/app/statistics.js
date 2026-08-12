const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');
const settings = require('./settings');

function statsFile(guildId) {
    return path.join(__dirname, '../../data', guildId, 'stats.json');
}

const voiceJoinTimes = new Map();

function trackJoin(guildId, userId) {
    voiceJoinTimes.set(`${guildId}:${userId}`, Date.now());
}

function trackLeave(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const joinTime = voiceJoinTimes.get(key);
    if (!joinTime) return;
    trackVocal(guildId, userId, Math.floor((Date.now() - joinTime) / 1000));
    voiceJoinTimes.delete(key);
}

function liveSeconds(guildId, userId) {
    const joinTime = voiceJoinTimes.get(`${guildId}:${userId}`);
    return joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0;
}

async function load(guildId) {
    try {
        const file = statsFile(guildId);
        try {
            await fs.promises.access(file);
            const data = await fs.promises.readFile(file, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') return {};
            throw err;
        }
    } catch (err) {
        handleError(err, `Loading stats for guild ${guildId}`);
        return {};
    }
}

async function save(guildId, data) {
    const file = statsFile(guildId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
}

function today(guildId) {
    const zone = settings.toIanaZone(settings.getTimezone(guildId));
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
}

async function trackMessage(guildId, userId) {
    const data = await load(guildId);
    const date = today(guildId);
    if (!data[userId]) data[userId] = { messages: {}, vocal: {} };
    if (!data[userId].messages) data[userId].messages = {};
    data[userId].messages[date] = (data[userId].messages[date] || 0) + 1;
    data[userId].messages.total = (data[userId].messages.total || 0) + 1;
    await save(guildId, data);
    logger.debug(`(Guild ${guildId}) Message tracked for ${userId} on ${date} (${data[userId].messages.total})`);
}

async function trackVocal(guildId, userId, seconds) {
    if (seconds <= 0) return;
    const data = await load(guildId);
    const date = today(guildId);
    if (!data[userId]) data[userId] = { messages: {}, vocal: {} };
    if (!data[userId].vocal) data[userId].vocal = {};
    data[userId].vocal[date] = (data[userId].vocal[date] || 0) + seconds;
    data[userId].vocal.total = (data[userId].vocal.total || 0) + seconds;
    await save(guildId, data);
    logger.debug(`(Guild ${guildId}) Vocal tracked for ${userId} on ${date}: +${seconds}s (${data[userId].vocal.total}s)`);
}

function getPeriodKeys(period, guildId) {
    if (period === 'global') return null;

    const zone = settings.toIanaZone(settings.getTimezone(guildId));
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

    if (period === 'today') return new Set([todayKey]);

    const [YEAR, MONTH, DAY] = todayKey.split('-').map(Number);
    const anchor = new Date(Date.UTC(YEAR, MONTH - 1, DAY));
    const cutoff = new Date(anchor);
    if (period === 'week') cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    else if (period === 'month') cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
    else if (period === 'year') cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);

    const keys = new Set();
    const date = new Date(cutoff);
    while (date <= anchor) {
        keys.add(date.toISOString().slice(0, 10));
        date.setUTCDate(date.getUTCDate() + 1);
    }
    return keys;
}

function sumUser(userData, field, keys) {
    const bucket =
        userData[field] || userData[field === 'vocal' ? 'voice' : field] || {};
    if (keys === null) {
        if (bucket.total != null) return bucket.total;
        return Object.entries(bucket)
            .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
            .reduce((sum, [, value]) => sum + value, 0);
    }
    return Object.entries(bucket)
        .filter(([k]) => keys.has(k))
        .reduce((sum, [, v]) => sum + v, 0);
}

function leaderboard(data, guildId, period, field) {
    const keys = getPeriodKeys(period, guildId);
    const userIds = new Set(Object.keys(data));
    for (const key of voiceJoinTimes.keys()) {
        const [guildKey, userKey] = key.split(':');
        if (guildKey === guildId) userIds.add(userKey);
    }
    return Array.from(userIds)
        .map((userId) => {
            const userData = data[userId] || { messages: {}, vocal: {} };
            let count = sumUser(userData, field, keys);
            if (field === 'vocal') count += liveSeconds(guildId, userId);
            return { userId, count };
        })
        .filter((e) => e.count > 0)
        .sort((a, b) => b.count - a.count);
}

function userStats(data, userId, period, guildId) {
    const keys = getPeriodKeys(period, guildId);
    const userData = data[userId] || { messages: {}, vocal: {} };
    return {
        messages: sumUser(userData, 'messages', keys),
        vocal: sumUser(userData, 'vocal', keys) + (guildId ? liveSeconds(guildId, userId) : 0),
    };
}

module.exports = {
    load,
    trackMessage,
    trackJoin,
    trackLeave,
    leaderboard,
    userStats
};
