const settings = require('../../utils/settings');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { handleError } = require('../../utils/errorHandler');

// TODO: wire timezone and use24h to 'data/<guildId>/settings.json' option keys
function defaultConfig() {
	return {
		channelId: null,
		gifUrl: null,
		userLastSent: {},
		lastSentDate: null,
		lastSentBy: null,
		totalPasses: 0,
		todayPasses: 0,
		timezone: 'Europe/Paris',
		use24h: true
	};
}

function load(guildId) {
	if (!guildId) return defaultConfig();
	try {
		const cfgPath = path.join(__dirname, '../../../data', guildId, 'shrimp.json');
		if (!fs.existsSync(cfgPath)) return defaultConfig();
		const raw = fs.readFileSync(cfgPath, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		handleError(err, `Loading shrimp config for guild ${guildId}`);
		return defaultConfig();
	}
}

function save(data, guildId) {
	if (!guildId) return;
	try {
		const cfgPath = path.join(__dirname, '../../../data', guildId, 'shrimp.json');
		fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
		fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2));
	} catch (err) {
		handleError(err, `Saving shrimp config for guild ${guildId}`);
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

function _today(guildId) {
	const cfg = load(guildId);
	const tz = cfg.timezone || 'Europe/Paris';
	return new Intl.DateTimeFormat('fr-FR', { timeZone: tz }).format(new Date());
}

function canUserSendToday(userId, guildId) {
	const shrimp = load(guildId);
	if (!shrimp.userLastSent) shrimp.userLastSent = {};
	const last = shrimp.userLastSent[userId];
	if (!last) return true;
	return last !== _today(guildId);
}

function getUserCooldownRemaining(userId, guildId) {
	const shrimp = load(guildId);
	if (!shrimp.userLastSent) return 0;
	const last = shrimp.userLastSent[userId];
	if (!last) return 0;
	if (typeof last !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(last)) return 0;
	if (last !== _today(guildId)) return 0;
	try {
		const now = new Date();
		const tz = shrimp.timezone || 'Europe/Paris';
		const parts = new Intl.DateTimeFormat('fr', {
			timeZone: tz,
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).formatToParts(now).reduce((acc, p) => {
			if (p.type === 'hour') acc.hour = parseInt(p.value, 10);
			if (p.type === 'minute') acc.minute = parseInt(p.value, 10);
			if (p.type === 'second') acc.second = parseInt(p.value, 10);
			return acc;
		}, {});
		const ms = now.getMilliseconds();
		const elapsedMs = ((parts.hour || 0) * 3600 + (parts.minute || 0) * 60 + (parts.second || 0)) * 1000 + ms;
		const remaining = 24 * 3600 * 1000 - elapsedMs;
		return remaining > 0 ? remaining : 0;
	} catch (err) {
		handleError(err, `Calculating cooldown remaining for user ${userId} in guild ${guildId}`);
		return 0;
	}
}

function getUsersOnCooldown(guildId) {
	const shrimp = load(guildId);
	const out = [];
	if (!shrimp.userLastSent) return out;
	for (const [userId, last] of Object.entries(shrimp.userLastSent)) {
		if (typeof last === 'string' && last === _today(guildId)) {
			const remaining = getUserCooldownRemaining(userId, guildId) || 0;
			out.push({ userId, remaining });
		}
	}
	return out;
}

function isGlobalSentToday(guildId) {
	const shrimp = load(guildId);
	return shrimp.lastSentDate === _today(guildId);
}

function isUserOnCooldown(userId, guildId) {
	const shrimp = load(guildId);
	if (!shrimp.userLastSent) return false;
	return shrimp.userLastSent[userId] === _today(guildId);
}

function recordGlobalSend(guildId, userId) {
	const shrimp = load(guildId);
	if (!shrimp.userLastSent) shrimp.userLastSent = {};
	const today = _today(guildId);

	if (shrimp.lastSentDate === today) {
		shrimp.todayPasses = (typeof shrimp.todayPasses === 'number' ? shrimp.todayPasses : 0) + 1;
	} else {
		shrimp.todayPasses = 1;
		shrimp.lastSentDate = today;
	}

	shrimp.totalPasses = (typeof shrimp.totalPasses === 'number' ? shrimp.totalPasses : 0) + 1;
	shrimp.lastSentBy = userId;
	shrimp.userLastSent[userId] = today;
	save(shrimp, guildId);
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
};
