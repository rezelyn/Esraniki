const { EmbedBuilder } = require("discord.js");

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const logger = require("../utils/logger");
const { handleError } = require("../utils/errorHandler");

const lang = require("../utils/lang");
const botSettings = require("../utils/settings");
const { color, emoji } = require("../utils/style");

const PUBLIC = path.join(__dirname, "public");
const { version } = require("../../package.json");

const sessions = new Map(); // sessionId: { userId, username, avatar, guilds, expiresAt }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let botAvatarURL = null;

const twitchLive = {}; // ${guildId}:${twitchChannel}
let twitchToken = null; // { access_token, expires_at }
let twitchTimer = null;
const TWITCH_POLL_INTERVAL_MS = 2 * 60 * 1000;

function hasAdmin(permissions) {
	try {
		return (BigInt(permissions) & 0x8n) === 0x8n;
	} catch (err) {
		handleError(err, "Checking admin permissions");
		return false;
	}
}

function discordGet(apiPath, accessToken) {
	return new Promise((resolve, reject) => {
		https
			.get(
				`https://discord.com/api/v10${apiPath}`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"User-Agent": "Esraniki",
					},
				},
				(res) => {
					let data = "";
					res.on("data", (c) => (data += c));
					res.on("end", () => {
						try {
							resolve(JSON.parse(data));
						} catch (err) {
							handleError(err, "Parsing Discord API response");
							reject(err);
						}
					});
				},
			)
			.on("error", reject);
	});
}

function discordTokenExchange(code, redirectUri, clientId, clientSecret) {
	return new Promise((resolve, reject) => {
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
		}).toString();
		const req = https.request(
			{
				hostname: "discord.com",
				path: "/api/oauth2/token",
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"Content-Length": Buffer.byteLength(body),
					"User-Agent": "Esraniki",
				},
			},
			(res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => {
					try {
						const p = JSON.parse(data);
						if (!p.access_token) {
							resolve(null);
							return;
						}
						resolve({
							access_token: p.access_token,
							expires_at: Date.now() + (p.expires_in - 60) * 1000,
						});
					} catch (err) {
						handleError(err, "Parsing Discord token response");
						reject(err);
					}
				});
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

const MC_INTERVAL_MS = 60000;
const mcStates = {};
const mcTimers = {};

function mcFile(guildId) {
	return path.join(__dirname, "../../data", guildId, "minecraft.json");
}

function mcLoad(guildId) {
	try {
		const f = mcFile(guildId);
		if (!fs.existsSync(f)) return null;
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (err) {
		handleError(err, `Loading Minecraft state for guild ${guildId}`);
		return null;
	}
}

function mcSave(guildId, state) {
	const f = mcFile(guildId);
	fs.mkdirSync(path.dirname(f), {
		recursive: true,
	});
	fs.writeFileSync(f, state ? JSON.stringify(state) : "null");
}

{
	const dataDir = path.join(__dirname, "../../data");
	if (fs.existsSync(dataDir)) {
		for (const entry of fs.readdirSync(dataDir, {
			withFileTypes: true,
		})) {
			if (!entry.isDirectory()) continue;
			const state = mcLoad(entry.name);
			if (state) mcStates[entry.name] = state;
		}
	}
}

function fetchServerInfo(ip) {
	return new Promise((resolve, reject) => {
		https
			.get(
				`https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`,
				{
					headers: {
						"User-Agent": "Esraniki",
					},
				},
				(res) => {
					let data = "";
					res.on("data", (c) => (data += c));
					res.on("end", () => {
						if (!data.startsWith("{")) {
							reject(new Error("Invalid API response"));
							return;
						}
						try {
							const p = JSON.parse(data);
							resolve({
								online: p.online === true || !p.debug?.error,
								motd: decodeHtmlEntities(
									p.motd?.clean?.join("\n") ||
										"A Minecraft server",
								),
								players: {
									online: p.players?.online || 0,
									max: p.players?.max || 0,
									list: p.players?.list || [],
								},
								version: p.version || "Unknown",
								iconUrl: `https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`,
							});
						} catch (err) {
							handleError(
								err,
								"Parsing Minecraft server info response",
							);
							reject(err);
						}
					});
				},
			)
			.on("error", reject);
	});
}

function decodeHtmlEntities(value) {
	const decodeCodePoint = (codePoint, original) =>
		Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
			? String.fromCodePoint(codePoint)
			: original;

	return String(value ?? "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (match, code) =>
			decodeCodePoint(Number(code), match),
		)
		.replace(/&#x([\da-f]+);/gi, (match, code) =>
			decodeCodePoint(parseInt(code, 16), match),
		);
}

function mcStartInterval(guildId, client) {
	if (mcTimers[guildId]) clearInterval(mcTimers[guildId]);
	mcTimers[guildId] = setInterval(async () => {
		const state = mcStates[guildId];
		if (!state) {
			clearInterval(mcTimers[guildId]);
			delete mcTimers[guildId];
			return;
		}
		try {
			const data = await fetchServerInfo(state.server);
			const channel = await client.channels
				.fetch(state.channelId)
				.catch(() => null);
			const message = channel
				? await channel.messages
						.fetch(state.messageId)
						.catch(() => null)
				: null;
			if (!message) {
				delete mcStates[guildId];
				mcSave(guildId, null);
				clearInterval(mcTimers[guildId]);
				delete mcTimers[guildId];
				return;
			}
			await message.edit({
				embeds: [buildMcEmbed(state.server, state.name, data, guildId)],
			});
		} catch (err) {
			handleError(err, "Minecraft update loop");
		}
	}, MC_INTERVAL_MS);
}

function buildMcEmbed(ip, name, data, guildId) {
	const embed = new EmbedBuilder()
		.setColor(data.online ? color.GREEN : color.GRAY)
		.setTitle(name)
		.setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`)
		.addFields(
			{
				name:
					emoji.STATUS +
					" " +
					lang.locale("minecraft.fields.status", {}, guildId),
				value: data.online
					? lang.locale("minecraft.statusOnline", {}, guildId)
					: lang.locale("minecraft.statusOffline", {}, guildId),
				inline: true,
			},
			{
				name:
					emoji.USER +
					" " +
					lang.locale("minecraft.fields.players", {}, guildId),
				value: `${data.players.online}/${data.players.max}`,
				inline: true,
			},
			{
				name:
					emoji.VERSION +
					" " +
					lang.locale("minecraft.fields.version", {}, guildId),
				value: (
					data.version ||
					lang.locale("minecraft.versionUnknown", {}, guildId)
				).substring(0, 1024),
				inline: true,
			},
		)
		.setFooter({
			text: lang.locale("minecraft.lastUpdated", {}, guildId),
		})
		.setTimestamp();
	if (data.online && data.motd) embed.setDescription(data.motd);
	const players = data.players.list || [];
	if (players.length > 0) {
		const shown = players.slice(0, 10);
		const rest = players.length - shown.length;
		let list = shown.map((p) => `- \`${p.name}\``).join("\n");
		if (rest > 0)
			list += `\n- ${lang.locale("minecraft.othersMore", { count: rest }, guildId)}`;
		embed.addFields({
			name:
				emoji.LIST +
				" " +
				lang.locale("minecraft.connected", {}, guildId),
			value: list.substring(0, 1024),
		});
	}
	return embed;
}

async function mcInit(client) {
	for (const [guildId, state] of Object.entries(mcStates)) {
		try {
			const channel = await client.channels
				.fetch(state.channelId)
				.catch(() => null);
			const message = channel
				? await channel.messages
						.fetch(state.messageId)
						.catch(() => null)
				: null;
			if (!message) {
				logger.debug(
					`Minecraft tracked message not found for Guild ${guildId}, keeping state`,
				);
				continue;
			}
			logger.debug(
				`Resuming Minecraft monitor for ${state.server} (Guild ${guildId})`,
			);
			mcStartInterval(guildId, client);
		} catch (err) {
			handleError(
				err,
				`Failed to restore Minecraft state for Guild ${guildId}`,
			);
		}
	}
}

function twitchFile(guildId) {
	return path.join(__dirname, "../../data", guildId, "twitch.json");
}

function loadTwitch(guildId) {
	try {
		const f = twitchFile(guildId);
		if (!fs.existsSync(f))
			return {
				entries: [],
			};
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (err) {
		handleError(err, `Loading Twitch config for guild ${guildId}`);
		return {
			entries: [],
		};
	}
}

function saveTwitch(guildId, data) {
	const f = twitchFile(guildId);
	fs.mkdirSync(path.dirname(f), {
		recursive: true,
	});
	fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

function fetchTwitchAppToken() {
	const clientId = process.env.TWITCH_CLIENT_ID;
	const clientSecret = process.env.TWITCH_CLIENT_SECRET;
	if (!clientId || !clientSecret) return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "client_credentials",
		}).toString();
		const req = https.request(
			{
				hostname: "id.twitch.tv",
				path: "/oauth2/token",
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"Content-Length": Buffer.byteLength(body),
					"User-Agent": "Esraniki",
				},
			},
			(res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => {
					try {
						const p = JSON.parse(data);
						if (!p.access_token) {
							resolve(null);
							return;
						}
						resolve({
							access_token: p.access_token,
							expires_at: Date.now() + (p.expires_in - 60) * 1000,
						});
					} catch (err) {
						handleError(err, "Parsing Twitch app token response");
						reject(err);
					}
				});
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

async function getTwitchToken() {
	if (!twitchToken || Date.now() >= twitchToken.expires_at) {
		twitchToken = await fetchTwitchAppToken();
	}
	return twitchToken;
}

function fetchTwitchStreams(channels) {
	return getTwitchToken().then((token) => {
		if (!token) return [];
		const clientId = process.env.TWITCH_CLIENT_ID;
		const query = channels
			.map((c) => `user_login=${encodeURIComponent(c.toLowerCase())}`)
			.join("&");
		return new Promise((resolve, reject) => {
			https
				.get(
					`https://api.twitch.tv/helix/streams?${query}`,
					{
						headers: {
							Authorization: `Bearer ${token.access_token}`,
							"Client-Id": clientId,
							"User-Agent": "Esraniki",
						},
					},
					(res) => {
						let data = "";
						res.on("data", (c) => (data += c));
						res.on("end", () => {
							try {
								const p = JSON.parse(data);
								resolve(Array.isArray(p.data) ? p.data : []);
							} catch (err) {
								handleError(
									err,
									"Parsing Twitch streams response",
								);
								reject(err);
							}
						});
					},
				)
				.on("error", reject);
		});
	});
}

function fetchTwitchUsers(logins) {
	return getTwitchToken().then((token) => {
		if (!token) return [];
		const clientId = process.env.TWITCH_CLIENT_ID;
		const query = logins
			.map((l) => `login=${encodeURIComponent(l.toLowerCase())}`)
			.join("&");
		return new Promise((resolve, reject) => {
			https
				.get(
					`https://api.twitch.tv/helix/users?${query}`,
					{
						headers: {
							Authorization: `Bearer ${token.access_token}`,
							"Client-Id": clientId,
							"User-Agent": "Esraniki",
						},
					},
					(res) => {
						let data = "";
						res.on("data", (c) => (data += c));
						res.on("end", () => {
							try {
								const p = JSON.parse(data);
								resolve(Array.isArray(p.data) ? p.data : []);
							} catch (err) {
								handleError(err, "Parsing Twitch users response");
								reject(err);
							}
						});
					},
				)
				.on("error", reject);
		});
	});
}

async function pollTwitch(client) {
	if (!client) return;
	const dataDir = path.join(__dirname, "../../data");
	if (!fs.existsSync(dataDir)) return;
	for (const entry of fs.readdirSync(dataDir, {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory()) continue;
		const guildId = entry.name;
		const config = loadTwitch(guildId);
		if (!config.entries || config.entries.length === 0) continue;
		const twitchChannels = config.entries
			.map((e) => (e.twitchChannel || "").trim())
			.filter(Boolean);
		if (twitchChannels.length === 0) continue;
		try {
			const streams = await fetchTwitchStreams(twitchChannels);
			const liveSet = new Set(
				streams.map((s) => s.user_login.toLowerCase()),
			);
			for (const e of config.entries) {
				const ch = (e.twitchChannel || "").trim().toLowerCase();
				if (!ch) continue;
				const key = `${guildId}:${ch}`;
				const wasLive = twitchLive[key] ?? false;
				const isLive = liveSet.has(ch);
				if (isLive && !wasLive) {
					const discordChannel = await client.channels
						.fetch(e.discordChannelId)
						.catch(() => null);
					if (discordChannel) {
						const stream = streams.find(
							(s) => s.user_login.toLowerCase() === ch,
						);
						const url = `https://twitch.tv/${e.twitchChannel}`;
						const template =
							e.message || "🔴 {streamer} is now live on Twitch!";
						const hasUrlVar = template.includes("{url}");
						const msg = template
							.replace(/\{streamer\}/g, e.twitchChannel)
							.replace(/\{title\}/g, stream?.title || "")
							.replace(/\{game\}/g, stream?.game_name || "")
							.replace(/\{url\}/g, url);
						await discordChannel
							.send(hasUrlVar ? msg : `${msg}\n${url}`)
							.catch(() => null);
						logger.info(
							`Twitch announcement sent for ${e.twitchChannel} in guild ${guildId}`,
						);
					}
					twitchLive[key] = isLive;
				}
			}
		} catch (err) {
			handleError(err, `Twitch poll failed for guild ${guildId}`);
		}
	}
}

function twitchInit(client) {
	if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
		logger.debug(
			"TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set — Twitch announcements disabled",
		);
		return;
	}
	if (twitchTimer) clearInterval(twitchTimer);
	pollTwitch(client);
	twitchTimer = setInterval(
		() => pollTwitch(client),
		TWITCH_POLL_INTERVAL_MS,
	);
	logger.debug("Twitch announcement polling started");
}

function statsFile(guildId) {
	return path.join(__dirname, "../../data", guildId, "stats.json");
}

function loadStats(guildId) {
	try {
		const f = statsFile(guildId);
		if (!fs.existsSync(f)) return {};
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (err) {
		handleError(err, `Loading stats for guild ${guildId}`);
		return {};
	}
}

function saveStats(guildId, data) {
	const f = statsFile(guildId);
	fs.mkdirSync(path.dirname(f), {
		recursive: true,
	});
	fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

function sumField(obj, ...fields) {
	for (const f of fields) {
		const bucket = obj[f];
		if (bucket) {
			if (bucket.total != null) return bucket.total;
			return Object.entries(bucket)
				.filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
				.reduce((a, [, b]) => a + b, 0);
		}
	}
	return 0;
}

async function getStatsLeaderboard(client, guildId) {
	const data = loadStats(guildId);
	const entries = Object.entries(data).map(([userId, u]) => ({
		userId,
		messages: sumField(u, "messages"),
		vocal: sumField(u, "vocal", "voice"),
	}));
	const byMessages = [...entries].sort((a, b) => b.messages - a.messages);
	const byVocal = [...entries].sort((a, b) => b.vocal - a.vocal);
	const msgRank = Object.fromEntries(
		byMessages.map((e, i) => [e.userId, i + 1]),
	);
	const vocalRank = Object.fromEntries(
		byVocal.map((e, i) => [e.userId, i + 1]),
	);
	const result = [];
	for (const entry of byMessages) {
		let username = entry.userId,
			avatarURL = null;
		try {
			const g = client?.guilds?.cache?.get(guildId);
			const member = await g?.members
				.fetch(entry.userId)
				.catch(() => null);
			if (member) {
				username = member.user.username;
				avatarURL = member.user.displayAvatarURL({
					size: 64,
					extension: "png",
				});
			}
		} catch (err) {
			handleError(
				err,
				`Fetching member ${entry.userId} for stats leaderboard`,
			);
		}
		result.push({
			userId: entry.userId,
			username,
			avatarURL,
			messages: entry.messages,
			vocal: entry.vocal,
			msgRank: msgRank[entry.userId],
			vocalRank: vocalRank[entry.userId],
		});
	}
	return result;
}

function rulesFile(guildId) {
	return path.join(__dirname, "../../data", guildId, "rules.json");
}
const ESRANIKI = 0xd52146;
const MAX_BODY = 512 * 1024;

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
};

function loadRules(guildId) {
	try {
		const f = rulesFile(guildId);
		if (!fs.existsSync(f)) return null;
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (err) {
		handleError(err, `Loading rules for guild ${guildId}`);
		return null;
	}
}

function saveRules(guildId, state) {
	const f = rulesFile(guildId);
	fs.mkdirSync(path.dirname(f), {
		recursive: true,
	});
	fs.writeFileSync(f, JSON.stringify(state, null, 2));
}

function buildHeaderEmbed(state) {
	const embed = new EmbedBuilder().setColor(ESRANIKI).setTitle(state.title);
	if (state.description) embed.setDescription(state.description);
	return embed;
}

function buildSectionEmbed(section) {
	const description =
		section.rules.length > 0
			? section.rules
					.map((r) => `**${section.id}.${r.id}.** ${r.text}`)
					.join("\n")
			: "*—*";
	return new EmbedBuilder()
		.setColor(ESRANIKI)
		.setTitle(`${section.id}. ${section.name}`)
		.setDescription(description);
}

async function postRulesInChannel(state, channel) {
	const headerMsg = await channel.send({
		embeds: [buildHeaderEmbed(state)],
	});
	state.headerMessageId = headerMsg.id;
	for (const section of state.sections) {
		const msg = await channel.send({
			embeds: [buildSectionEmbed(section)],
		});
		section.messageId = msg.id;
	}
}

async function deleteRulesMessages(state, client) {
	if (!state?.channelId) return;
	const ch = await client.channels.fetch(state.channelId).catch(() => null);
	if (!ch) return;
	const ids = [
		state.headerMessageId,
		...state.sections.map((s) => s.messageId),
	].filter(Boolean);
	for (const id of ids) {
		const msg = await ch.messages.fetch(id).catch(() => null);
		if (msg) await msg.delete().catch(() => null);
	}
}

async function syncRules(state, client) {
	if (!client || !state?.channelId) return;
	const channel = await client.channels
		.fetch(state.channelId)
		.catch(() => null);
	if (!channel) return;

	if (state.headerMessageId) {
		const msg = await channel.messages
			.fetch(state.headerMessageId)
			.catch(() => null);
		if (msg)
			await msg
				.edit({
					embeds: [buildHeaderEmbed(state)],
				})
				.catch(() => null);
	}

	for (const section of state.sections) {
		if (section.messageId) {
			const msg = await channel.messages
				.fetch(section.messageId)
				.catch(() => null);
			if (msg)
				await msg
					.edit({
						embeds: [buildSectionEmbed(section)],
					})
					.catch(() => null);
			else {
				const newMsg = await channel
					.send({
						embeds: [buildSectionEmbed(section)],
					})
					.catch(() => null);
				if (newMsg) section.messageId = newMsg.id;
			}
		} else {
			const msg = await channel
				.send({
					embeds: [buildSectionEmbed(section)],
				})
				.catch(() => null);
			if (msg) section.messageId = msg.id;
		}
	}
}

function getLocalIPv4() {
	const ifaces = os.networkInterfaces();
	for (const addrs of Object.values(ifaces)) {
		for (const addr of addrs) {
			if (addr.family === "IPv4" && !addr.internal) return addr.address;
		}
	}
	return "0.0.0.0";
}

function cpuPercent() {
	const cpus = os.cpus();
	let idle = 0,
		total = 0;
	for (const cpu of cpus) {
		for (const t in cpu.times) total += cpu.times[t];
		idle += cpu.times.idle;
	}
	return Math.max(0, Math.min(100, 100 - Math.round((idle / total) * 100)));
}

async function getStatus(client) {
	const mem = process.memoryUsage();
	let avatarURL = null,
		bannerURL = null;

	if (client?.user) {
		avatarURL = client.user.displayAvatarURL({
			size: 256,
			extension: "png",
		});
		try {
			const fetched = await client.users.fetch(client.user.id, {
				force: true,
			});
			bannerURL =
				fetched.bannerURL({
					size: 1024,
					extension: "png",
				}) ?? null;
		} catch (err) {
			handleError(err, "Fetching bot user banner");
		}
	}

	return {
		tag: client?.user?.tag ?? null,
		clientId: client?.user?.id ?? null,
		guilds: client?.guilds?.cache?.size ?? null,
		ping: client?.ws?.ping ?? null,
		uptime: process.uptime(),
		cpu: cpuPercent(),
		memUsed: Math.round(mem.heapUsed / 1024 / 1024),
		memTotal: Math.round(mem.heapTotal / 1024 / 1024),
		node: process.version,
		djs: require("discord.js").version,
		platform: os.platform(),
		version,
		avatarURL,
		bannerURL,
	};
}

async function getGuilds(client) {
	if (!client) return [];
	try {
		const partials = await client.guilds.fetch().catch(() => null);
		if (!partials) return [];
		const result = [];
		for (const [, partial] of partials) {
			const guild = await partial.fetch().catch(() => null);
			if (!guild) continue;
			result.push({
				id: guild.id,
				name: guild.name,
				iconURL:
					guild.iconURL({
						size: 64,
						extension: "png",
					}) ?? null,
			});
		}
		return result.sort((a, b) => a.name.localeCompare(b.name));
	} catch (err) {
		handleError(err, "Fetching guilds");
		return [];
	}
}

async function getChannels(client, guildId) {
	if (!guildId || !client) return [];
	try {
		const guild = await client.guilds.fetch(guildId).catch(() => null);
		if (!guild) return [];
		const channels = await guild.channels.fetch().catch(() => null);
		if (!channels) return [];
		return channels
			.filter((c) => c.type === 0)
			.map((c) => ({
				id: c.id,
				name: c.name,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch (err) {
		handleError(err, `Getting channels for guild ${guildId}`);
		return [];
	}
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = "",
			size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			body += chunk;
		});
		req.on("end", () => resolve(body));
		req.on("error", reject);
	});
}

function serveStatic(pathname, res) {
	const rel = pathname === "/" ? "index.html" : pathname.slice(1);
	const resolved = path.resolve(PUBLIC, rel);
	if (!resolved.startsWith(PUBLIC + path.sep) && resolved !== PUBLIC) {
		res.writeHead(403);
		res.end();
		return;
	}
	try {
		const data = fs.readFileSync(resolved);
		const ext = path.extname(resolved);
		res.writeHead(200, {
			"Content-Type": MIME[ext] || "application/octet-stream",
			"Cache-Control": "no-store",
		});
		res.end(data);
	} catch (err) {
		handleError(err, `Serving static file ${pathname}`);
		res.writeHead(404);
		res.end();
	}
}

function json(res, code, data) {
	res.writeHead(code, {
		"Content-Type": "application/json",
	});
	res.end(JSON.stringify(data));
}

function start(client) {
	const port = parseInt(process.env.DASHBOARD_PORT, 10) || 3000;
	const clientId = process.env.CLIENT_ID;
	const clientSecret = process.env.CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		logger.warn(
			"CLIENT_ID or CLIENT_SECRET is not set, dashboard is disabled",
		);
		return;
	}

	const server = http.createServer(async (req, res) => {
		try {
			const reqUrl = new URL(req.url, "http://localhost");
			const pathname = reqUrl.pathname;
			const guildId = reqUrl.searchParams.get("guild") ?? "";

			const authHeader = req.headers["authorization"];
			const sessionId = authHeader?.startsWith("Bearer ")
				? authHeader.slice(7)
				: null;
			const session = sessionId ? sessions.get(sessionId) : null;

			if (pathname === "/api/brand") {
				json(res, 200, {
					avatarURL: botAvatarURL,
					version,
				});
				return;
			}

			if (pathname === "/auth/login") {
				const redirectUri =
					process.env.REDIRECT_URI ||
					`http://localhost:${port}/auth/callback`;
				const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+guilds`;
				res.writeHead(302, {
					Location: url,
				});
				res.end();
				return;
			}

			if (pathname === "/auth/callback") {
				const code = reqUrl.searchParams.get("code");
				if (!code) {
					res.writeHead(302, {
						Location: "/?error=no_code",
					});
					res.end();
					return;
				}
				try {
					const redirectUri =
						process.env.REDIRECT_URI ||
						`http://localhost:${port}/auth/callback`;
					const tokens = await discordTokenExchange(
						code,
						redirectUri,
						clientId,
						clientSecret,
					);
					if (!tokens.access_token) {
						res.writeHead(302, {
							Location: "/?error=auth_failed",
						});
						res.end();
						return;
					}
					const [user, rawGuilds] = await Promise.all([
						discordGet("/users/@me", tokens.access_token),
						discordGet("/users/@me/guilds", tokens.access_token),
					]);
					const botGuildIds = new Set(
						client?.guilds?.cache?.keys() ?? [],
					);
					const guilds = rawGuilds
						.filter(
							(g) =>
								hasAdmin(g.permissions) &&
								botGuildIds.has(g.id),
						)
						.map((g) => ({
							id: g.id,
							name: g.name,
							iconURL: g.icon
								? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
								: null,
						}))
						.sort((a, b) => a.name.localeCompare(b.name));
					if (guilds.length === 0) {
						res.writeHead(302, {
							Location: "/?error=no_access",
						});
						res.end();
						return;
					}
					const newSessionId = crypto.randomBytes(32).toString("hex");
					sessions.set(newSessionId, {
						userId: user.id,
						username: user.username,
						avatar: user.avatar
							? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
							: null,
						guilds,
						expiresAt: Date.now() + SESSION_TTL_MS,
					});
					logger.info(
						`New dashboard login: @${user.username} (${user.id})`,
					);
					res.writeHead(302, {
						Location: `/?s=${newSessionId}`,
					});
					res.end();
					return;
				} catch (err) {
					handleError(err, "OAuth callback error");
					res.writeHead(302, {
						Location: "/?error=server_error",
					});
					res.end();
					return;
				}
				return;
			}

			if (pathname === "/auth/logout") {
				if (sessionId) sessions.delete(sessionId);
				res.writeHead(302, {
					Location: "/",
				});
				res.end();
				return;
			}

			if (!pathname.startsWith("/api/")) {
				serveStatic(pathname, res);
				return;
			}

			if (!session || session.expiresAt < Date.now()) {
				if (session) sessions.delete(sessionId);
				json(res, 401, {
					error: "Unauthorized",
				});
				return;
			}

			if (pathname === "/api/me" && req.method === "GET") {
				json(res, 200, {
					userId: session.userId,
					username: session.username,
					avatar: session.avatar,
				});
				return;
			}

			if (pathname === "/api/logout" && req.method === "POST") {
				sessions.delete(sessionId);
				json(res, 200, {
					ok: true,
				});
				return;
			}

			if (pathname === "/api/status" && req.method === "GET") {
				json(res, 200, await getStatus(client));
				return;
			}

			if (pathname === "/api/logs" && req.method === "GET") {
				const since = parseInt(
					reqUrl.searchParams.get("since") ?? "0",
					10,
				);
				json(res, 200, logger.getLogs(since));
				return;
			}

			if (pathname === "/api/guilds" && req.method === "GET") {
				json(res, 200, session.guilds);
				return;
			}

			if (guildId && !session.guilds.find((g) => g.id === guildId)) {
				json(res, 403, {
					error: "Access denied",
				});
				return;
			}

			if (pathname === "/api/channels" && req.method === "GET") {
				json(res, 200, await getChannels(client, guildId));
				return;
			}

			if (pathname === "/api/admins" && req.method === "GET") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				try {
					const guild = await client?.guilds
						.fetch(guildId)
						.catch(() => null);
					if (!guild) {
						json(res, 200, []);
						return;
					}
					const members = await guild.members
						.fetch()
						.catch(() => null);
					if (!members) {
						json(res, 200, []);
						return;
					}
					const admins = members
						.filter((m) => !m.user.bot && m.permissions.has(8n))
						.map((m) => ({
							id: m.user.id,
							username: m.user.username,
							displayName: m.displayName,
							avatarURL: m.user.displayAvatarURL({
								size: 64,
								extension: "png",
							}),
						}))
						.sort((a, b) =>
							a.displayName.localeCompare(b.displayName),
						);
					json(res, 200, admins);
				} catch (err) {
					handleError(err, "Fetching admins");
					json(res, 500, {
						error: e.message,
					});
				}
				return;
			}

			if (pathname === "/api/rules" && req.method === "GET") {
				json(res, 200, loadRules(guildId));
				return;
			}

			if (pathname === "/api/rules" && req.method === "POST") {
				const incoming = JSON.parse(await readBody(req));
				const current = loadRules(guildId) ?? {};
				const newChannelId = incoming.channelId || null;
				const channelChanged =
					newChannelId && newChannelId !== current.channelId;

				const newState = {
					...current,
					title: incoming.title,
					description: incoming.description,
					channelId: newChannelId ?? current.channelId,
					sections: (incoming.sections ?? []).map((section) => {
						const existing = current.sections?.find(
							(s) => s.id === section.id,
						);
						return {
							id: section.id,
							name: section.name,
							messageId: existing?.messageId,
							rules: section.rules,
						};
					}),
				};

				if (channelChanged && client) {
					await deleteRulesMessages(current, client);
					newState.headerMessageId = undefined;
					for (const s of newState.sections) s.messageId = undefined;
					const newChannel = await client.channels
						.fetch(newState.channelId)
						.catch(() => null);
					if (newChannel)
						await postRulesInChannel(newState, newChannel);
				} else if (newState.channelId) {
					await syncRules(newState, client);
				}

				saveRules(guildId, newState);
				logger.info(
					`Rules updated for guild ${guildId} (${newState.sections?.length ?? 0} sections, channel: ${newState.channelId ?? "none"})`,
				);
				json(res, 200, {
					ok: true,
					state: newState,
				});
				return;
			}

			if (pathname === "/api/stats" && req.method === "GET") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				json(res, 200, await getStatsLeaderboard(client, guildId));
				return;
			}

			if (pathname === "/api/stats/user" && req.method === "POST") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				const userId = reqUrl.searchParams.get("user");
				if (!userId) {
					json(res, 400, {
						error: "Missing user",
					});
					return;
				}
				const body = JSON.parse(await readBody(req));
				const data = loadStats(guildId);
				if (!data[userId]) data[userId] = {};
				if (!data[userId].messages) data[userId].messages = {};
				if (!data[userId].vocal) data[userId].vocal = {};
				const messages = Math.max(0, Math.round(body.messages ?? 0));
				const vocal = Math.max(0, Math.round(body.vocal ?? 0));
				data[userId].messages.total = messages;
				data[userId].vocal.total = vocal;
				saveStats(guildId, data);
				logger.info(
					`Stats updated for user ${userId} in guild ${guildId} (messages: ${messages}, vocal: ${vocal}s)`,
				);
				json(res, 200, {
					ok: true,
				});
				return;
			}

			if (pathname === "/api/stats/user" && req.method === "DELETE") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				const userId = reqUrl.searchParams.get("user");
				if (!userId) {
					json(res, 400, {
						error: "Missing user",
					});
					return;
				}
				const data = loadStats(guildId);
				delete data[userId];
				saveStats(guildId, data);
				logger.info(
					`Stats deleted for user ${userId} in guild ${guildId}`,
				);
				json(res, 200, {
					ok: true,
				});
				return;
			}

			if (pathname === "/api/settings" && req.method === "GET") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				json(res, 200, {
					language: lang.getLanguage(guildId),
					supported: lang.supported,
					debug: botSettings.get("debug", false),
				});
				return;
			}

			if (pathname === "/api/settings" && req.method === "POST") {
				if (!guildId) {
					json(res, 400, {
						error: "Missing guild",
					});
					return;
				}
				const body = JSON.parse(await readBody(req));
				if (body.language) lang.setLanguage(body.language, guildId);
				if (typeof body.debug === "boolean") {
					botSettings.set("debug", body.debug);
					logger.info(
						`Debug mode ${body.debug ? "enabled" : "disabled"}`,
					);
				}
				json(res, 200, {
					ok: true,
				});
				return;
			}

			if (pathname === "/api/minecraft" && req.method === "GET") {
				const state = mcStates[guildId];
				json(
					res,
					200,
					state
						? {
								tracking: true,
								server: state.server,
								name: state.name,
								channelId: state.channelId,
								messageId: state.messageId,
							}
						: {
								tracking: false,
							},
				);
				return;
			}

			if (pathname === "/api/minecraft/status" && req.method === "GET") {
				const state = mcStates[guildId];
				if (!state) {
					json(res, 200, null);
					return;
				}
				try {
					const data = await fetchServerInfo(state.server);
					json(res, 200, data);
				} catch (err) {
					handleError(
						err,
						`Fetching Minecraft server info for ${state.server}`,
					);
					json(res, 502, {
						error: e.message,
					});
				}
				return;
			}

			if (pathname === "/api/minecraft/fetch" && req.method === "POST") {
				const body = JSON.parse(await readBody(req));
				const ip = (body.ip || "").trim();
				if (!ip) {
					res.writeHead(400, {
						error: "Missing ip",
					});
					res.end();
					return;
				}
				try {
					json(res, 200, await fetchServerInfo(ip));
				} catch (err) {
					handleError(err, `Fetching server info for ${ip}`);
					res.writeHead(502, {
						error: e.message,
					});
					res.end();
				}
				return;
			}

			if (pathname === "/api/minecraft/track" && req.method === "POST") {
				const body = JSON.parse(await readBody(req));
				const ip = (body.ip || "").trim();
				const name = (body.name || ip).trim();
				const channelId = (body.channelId || "").trim();
				if (!ip || !channelId) {
					res.writeHead(400, {
						error: "Missing ip or channelId",
					});
					res.end();
					return;
				}
				if (!guildId) {
					res.writeHead(400, {
						error: "Missing guild",
					});
					res.end();
					return;
				}
				if (!client) {
					res.writeHead(503, {
						error: "Bot not ready",
					});
					res.end();
					return;
				}
				try {
					const data = await fetchServerInfo(ip);
					const channel = await client.channels
						.fetch(channelId)
						.catch(() => null);
					if (!channel) {
						res.writeHead(404, {
							error: "Channel not found",
						});
						res.end();
						return;
					}
					const prev = mcStates[guildId];
					if (prev) {
						const oldCh = await client.channels
							.fetch(prev.channelId)
							.catch(() => null);
						const oldMsg = oldCh
							? await oldCh.messages
									.fetch(prev.messageId)
									.catch(() => null)
							: null;
						if (oldMsg) await oldMsg.delete().catch(() => null);
					}
					if (mcTimers[guildId]) {
						clearInterval(mcTimers[guildId]);
						delete mcTimers[guildId];
					}
					const msg = await channel.send({
						embeds: [buildMcEmbed(ip, name, data, guildId)],
					});
					const state = {
						server: ip,
						name,
						channelId: channel.id,
						messageId: msg.id,
					};
					mcStates[guildId] = state;
					mcSave(guildId, state);
					mcStartInterval(guildId, client);
					logger.debug(
						`Minecraft tracking started for ${ip} in channel ${channelId} (guild ${guildId})`,
					);
					res.writeHead(200, {
						ok: true,
						state,
					});
					res.end();
				} catch (err) {
					handleError(err, `Setting up Minecraft tracking for ${ip}`);
					res.writeHead(502, {
						error: err.message,
					});
					res.end();
				}
				return;
			}

			if (
				pathname === "/api/minecraft/untrack" &&
				req.method === "POST"
			) {
				const state = mcStates[guildId];
				if (!state) {
					res.writeHead(200, {
						ok: true,
					});
					res.end();
					return;
				}
				if (client) {
					const ch = await client.channels
						.fetch(state.channelId)
						.catch(() => null);
					const msg = ch
						? await ch.messages
								.fetch(state.messageId)
								.catch(() => null)
						: null;
					if (msg) await msg.delete().catch(() => null);
				}
				if (mcTimers[guildId]) {
					clearInterval(mcTimers[guildId]);
					delete mcTimers[guildId];
				}
				delete mcStates[guildId];
				mcSave(guildId, null);
				logger.debug(`Minecraft tracking stopped (guild ${guildId})`);
				res.writeHead(200, {
					ok: true,
				});
				res.end();
				return;
			}

			if (
				pathname === "/api/minecraft/refresh" &&
				req.method === "POST"
			) {
				const state = mcStates[guildId];
				if (!state) {
					res.writeHead(404, {
						error: "Not tracking",
					});
					res.end();
					return;
				}
				if (!client) {
					res.writeHead(503, {
						error: "Bot not ready",
					});
					res.end();
					return;
				}
				try {
					const data = await fetchServerInfo(state.server);
					const ch = await client.channels
						.fetch(state.channelId)
						.catch(() => null);
					const msg = ch
						? await ch.messages
								.fetch(state.messageId)
								.catch(() => null)
						: null;
					if (msg) {
						await msg.edit({
							embeds: [
								buildMcEmbed(
									state.server,
									state.name,
									data,
									guildId,
								),
							],
						});
					}
					logger.debug(
						`Minecraft embed refreshed for ${state.server} (guild ${guildId})`,
					);
					res.writeHead(200, {
						ok: true,
						data,
					});
					res.end();
				} catch (err) {
					handleError(
						err,
						`Refreshing Minecraft embed for ${state.server}`,
					);
					res.writeHead(502, {
						error: e.message,
					});
					res.end();
				}
				return;
			}

			if (pathname === "/api/twitch/avatars" && req.method === "GET") {
				if (!guildId) {
					res.writeHead(400, {
						error: "Missing guild",
					});
					res.end();
					return;
				}
				const config = loadTwitch(guildId);
				const logins = (config.entries ?? [])
					.map((e) => (e.twitchChannel || "").trim())
					.filter(Boolean);
				if (logins.length === 0) {
					res.writeHead(200, {});
					res.end();
					return;
				}
				try {
					const users = await fetchTwitchUsers(logins);
					const result = {};
					for (const u of users)
						result[u.login.toLowerCase()] = u.profile_image_url;
					res.writeHead(200, {
						"Content-Type": "application/json",
					});
					res.end(JSON.stringify(result));
				} catch (err) {
					handleError(
						err,
						`Fetching Twitch avatars for guild ${guildId}`,
					);
					res.writeHead(502, {
						error: e.message,
					});
					res.end();
				}
				return;
			}

			if (pathname === "/api/twitch" && req.method === "GET") {
				if (!guildId) {
					res.writeHead(400, {
						error: "Missing guild",
					});
					res.end();
					return;
				}
				res.writeHead(200, {
					"Content-Type": "application/json",
				});
				res.end(JSON.stringify(loadTwitch(guildId)));
				return;
			}

			if (pathname === "/api/twitch" && req.method === "POST") {
				if (!guildId) {
					res.writeHead(400, {
						error: "Missing guild",
					});
					res.end();
					return;
				}
				const body = JSON.parse(await readBody(req));
				const entries = (body.entries ?? [])
					.map((e, idx) => ({
						id: e.id ?? idx + 1,
						twitchChannel: (e.twitchChannel || "")
							.trim()
							.toLowerCase(),
						discordChannelId: (e.discordChannelId || "").trim(),
						message: (e.message || "").trim(),
					}))
					.filter((e) => e.twitchChannel && e.discordChannelId);
				saveTwitch(guildId, {
					entries,
				});
				logger.debug(
					`Twitch config updated for guild ${guildId} (${entries.length} channel${entries.length !== 1 ? "s" : ""})`,
				);
				res.writeHead(200, {
					"Content-Type": "application/json",
				});
				res.end(
					JSON.stringify({
						ok: true,
						entries,
					}),
				);
				return;
			}

			res.writeHead(404, {
				"Content-Type": "application/json",
			});
			res.end(
				JSON.stringify({
					error: "Not found",
				}),
			);
		} catch (err) {
			handleError(err, "Dashboard request error");
			if (!res.headersSent) {
				res.writeHead(500, {
					"Content-Type": "application/json",
				});
				res.end(
					JSON.stringify({
						error: "Internal server error",
					}),
				);
			}
		}
	});

	server.on("error", (err) => {
		if (err.code === "EADDRINUSE") {
			logger.error(`Dashboard port ${port} is already in use`);
		} else {
			logger.error("Dashboard server error: " + err.message);
		}
	});

	server.listen(port, "0.0.0.0", () => {
		logger.success(`Dashboard running at http://${getLocalIPv4()}:${port}`);
	});

	if (client) {
		const onReady = () => {
			botAvatarURL = client.user.displayAvatarURL({
				size: 128,
				extension: "png",
			});
			mcInit(client);
			twitchInit(client);
		};
		if (client.isReady()) {
			onReady();
		} else {
			client.once("clientReady", onReady);
		}
	}
}

module.exports = {
	start,
};
