const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

function statsFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "stats.json");
}

const voiceJoinTimes = new Map(); // key: ${guildId}:${userId}, value: timestamp

function trackJoin(guildId, userId) {
    voiceJoinTimes.set(`${guildId}:${userId}`, Date.now());
}

function trackLeave(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const joinTime = voiceJoinTimes.get(key);
    if (!joinTime) return;
    addVocal(guildId, userId, Math.floor((Date.now() - joinTime) / 1000));
    voiceJoinTimes.delete(key);
}

function liveSeconds(guildId, userId) {
    const joinTime = voiceJoinTimes.get(`${guildId}:${userId}`);
    return joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0;
}

function load(guildId) {
    try {
        const f = statsFile(guildId);
        if (!fs.existsSync(f)) return {};
        return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
        return {};
    }
}

function save(guildId, data) {
    const f = statsFile(guildId);
    fs.mkdirSync(path.dirname(f), {
        recursive: true
    });
    fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function addMessage(guildId, userId) {
    const data = load(guildId);
    const date = today();
    if (!data[userId]) data[userId] = {
        messages: {},
        vocal: {}
    };
    if (!data[userId].messages) data[userId].messages = {};
    data[userId].messages[date] = (data[userId].messages[date] || 0) + 1;
    data[userId].messages.total = (data[userId].messages.total || 0) + 1;
    save(guildId, data);
    logger.debug(
        `Message tracked for ${userId} in ${guildId} on ${date} (${data[userId].messages.total})`,
    );
}

function addVocal(guildId, userId, seconds) {
    if (seconds <= 0) return;
    const data = load(guildId);
    const date = today();
    if (!data[userId]) data[userId] = {
        messages: {},
        vocal: {}
    };
    if (!data[userId].vocal) data[userId].vocal = {};
    data[userId].vocal[date] = (data[userId].vocal[date] || 0) + seconds;
    data[userId].vocal.total = (data[userId].vocal.total || 0) + seconds;
    save(guildId, data);
    logger.debug(
        `Vocal tracked for ${userId} in ${guildId} on ${date}: +${seconds}s (${data[userId].vocal.total}s)`,
    );
}

function getPeriodKeys(period) {
    if (period === "global") return null;

    const now = new Date();

    if (period === "today") {
        return new Set([now.toISOString().slice(0, 10)]);
    }

    const cutoff = new Date(now);
    if (period === "week") cutoff.setDate(cutoff.getDate() - 7);
    else if (period === "month") cutoff.setMonth(cutoff.getMonth() - 1);
    else if (period === "year") cutoff.setFullYear(cutoff.getFullYear() - 1);

    const keys = new Set();
    const d = new Date(cutoff);
    while (d <= now) {
        keys.add(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
    }
    return keys;
}

function sumUser(userData, field, keys) {
    const bucket =
        userData[field] || userData[field === "vocal" ? "voice" : field] || {};
    if (keys === null) {
        if (bucket.total != null) return bucket.total;
        return Object.entries(bucket)
            .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
            .reduce((sum, [, v]) => sum + v, 0);
    }
    return Object.entries(bucket)
        .filter(([k]) => keys.has(k))
        .reduce((sum, [, v]) => sum + v, 0);
}

function leaderboard(data, guildId, period, field) {
    const keys = getPeriodKeys(period);

    // include users currently in voice who may not yet be in data
    const userIds = new Set(Object.keys(data));
    for (const key of voiceJoinTimes.keys()) {
        const [kGuild, kUser] = key.split(":");
        if (kGuild === guildId) userIds.add(kUser);
    }

    return Array.from(userIds)
        .map((userId) => {
            const userData = data[userId] || {
                messages: {},
                vocal: {}
            };
            let count = sumUser(userData, field, keys);
            if (field === "vocal") count += liveSeconds(guildId, userId);
            return {
                userId,
                count
            };
        })
        .filter((e) => e.count > 0)
        .sort((a, b) => b.count - a.count);
}

function userStats(data, userId, period, guildId) {
    const keys = getPeriodKeys(period);
    const userData = data[userId] || {
        messages: {},
        vocal: {}
    };
    return {
        messages: sumUser(userData, "messages", keys),
        vocal: sumUser(userData, "vocal", keys) +
            (guildId ? liveSeconds(guildId, userId) : 0),
    };
}

module.exports = {
    load,
    addMessage,
    trackJoin,
    trackLeave,
    leaderboard,
    userStats,
};
