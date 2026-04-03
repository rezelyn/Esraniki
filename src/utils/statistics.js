const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const file = path.join(__dirname, '../../data/stats.json');

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

function load() {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addMessage(guildId, userId) {
  const data = load();
  const date = today();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { messages: {}, vocal: {} };
  data[guildId][userId].messages[date] = (data[guildId][userId].messages[date] || 0) + 1;
  save(data);
  logger.debug(`Message tracked for ${userId} in ${guildId} on ${date} (total: ${data[guildId][userId].messages[date]})`);
}

function addVocal(guildId, userId, seconds) {
  if (seconds <= 0) return;
  const data = load();
  const date = today();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { messages: {}, vocal: {} };
  data[guildId][userId].vocal[date] = (data[guildId][userId].vocal[date] || 0) + seconds;
  save(data);
  logger.debug(`Vocal tracked for ${userId} in ${guildId} on ${date}: +${seconds}s (total: ${data[guildId][userId].vocal[date]}s)`);
}

function getPeriodKeys(period) {
  if (period === 'global') return null;

  const now = new Date();

  if (period === 'today') {
    return new Set([now.toISOString().slice(0, 10)]);
  }

  const cutoff = new Date(now);
  if (period === 'week') cutoff.setDate(cutoff.getDate() - 7);
  else if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (period === 'year') cutoff.setFullYear(cutoff.getFullYear() - 1);

  const keys = new Set();
  const d = new Date(cutoff);
  while (d <= now) {
    keys.add(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

function sumUser(userData, field, keys) {
  const bucket = userData[field] || {};
  if (keys === null) return Object.values(bucket).reduce((a, b) => a + b, 0);
  return Object.entries(bucket)
    .filter(([k]) => keys.has(k))
    .reduce((sum, [, v]) => sum + v, 0);
}

function leaderboard(data, guildId, period, field) {
  const keys = getPeriodKeys(period);
  const guild = data[guildId] || {};

  // include users currently in voice who may not yet be in data
  const userIds = new Set(Object.keys(guild));
  for (const key of voiceJoinTimes.keys()) {
    const [kGuild, kUser] = key.split(':');
    if (kGuild === guildId) userIds.add(kUser);
  }

  return Array.from(userIds)
    .map(userId => {
      const userData = guild[userId] || { messages: {}, vocal: {} };
      let count = sumUser(userData, field, keys);
      if (field === 'vocal') count += liveSeconds(guildId, userId);
      return { userId, count };
    })
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);
}

function userStats(data, guildId, userId, period) {
  const keys = getPeriodKeys(period);
  const userData = (data[guildId] || {})[userId] || { messages: {}, vocal: {} };
  return {
    messages: sumUser(userData, 'messages', keys),
    vocal: sumUser(userData, 'vocal', keys) + liveSeconds(guildId, userId)
  };
}

module.exports = { load, addMessage, trackJoin, trackLeave, leaderboard, userStats };
