// abandon all hope ye who enter here
// this nested spaghetti code monstrosity will be refactored eventually
// for now it works so im not touching shit here
// this is what backend hell looks like
// welcome to hell, machine.


const { EmbedBuilder } = require("discord.js");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const logger = require("../utils/logger");
const { handleError } = require("../utils/errorHandler");
const { TTLCache } = require("../utils/cache");
const { color, emoji } = require("../utils/style");
const lang = require("../utils/lang");
const appSettings = require("../app/settings");
const statistics = require("../app/statistics");
const shrimpGame = require("../app/games/shrimp");
const { version, repository, bugs, funding } = require("../../package.json");

const PUBLIC = path.join(__dirname, "public");

const adminsCache = new TTLCache(30000); // 30s
const langCache = new TTLCache(3600000); // 1h
const statsLeaderboardCache = new TTLCache(30000); // 30s
const twitchAvatarCache = new TTLCache(14400000); // 4h
const mcServerInfoCache = new TTLCache(30000); // 30s
const shrimpLeaderboardCache = new TTLCache(30000); // 30s

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TWITCH_POLL_INTERVAL_MS = 1 * 60 * 1000; // 60s

const sessions = new Map(); // sessionId: { userId, username, avatar, guilds, expiresAt }

const twitchLive = {}; // ${guildId}:${twitchChannel}:${discordChannelId}
let twitchToken = null; // { access_token, expires_at }
let twitchTokenRequest = null;
let twitchRetryAt = 0;
let twitchTimer = null;
let twitchPolling = false;

let botAvatarURL = null;

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json"
};

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (session.expiresAt < now) {
            sessions.delete(sessionId);
        }
    }
}, 300000); // 5m

function hasAdmin(permissions) {
    try {
        return (BigInt(permissions) & 0x8n) === 0x8n;
    } catch (err) {
        handleError(err, "Checking admin permissions");
        return false;
    }
}

function isOwner(session) {
    const ownerId = (process.env.OWNER_ID || "").trim();
    return Boolean(ownerId) && session.userId === ownerId;
}

function discordGet(apiPath, accessToken) {
    return new Promise((resolve, reject) => {
        https
            .get(`https://discord.com/api/v10${apiPath}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "User-Agent": "Esraniki"
                    },
                },
                (response) => {
                    let data = "";
                    response.on("data", (c) => (data += c));
                    response.on("end", () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (err) {
                            handleError(err, "Parsing Discord API response");
                            reject(err);
                        }
                    });
                }
            )
            .on("error", reject);
    });
}

function discordTokenExchange(code, redirectUri, clientId, clientSecret) {
    return new Promise((resolve, reject) => {
        const params = {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code
        };
        if (redirectUri) params.redirect_uri = redirectUri;
        const body = new URLSearchParams(params).toString();

        const request = https.request(
            {
                hostname: "discord.com",
                path: "/api/oauth2/token",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(body),
                    "User-Agent": "Esraniki"
                }
            },
            (response) => {
                let data = "";
                response.on("data", chunk => data += chunk);
                response.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (!parsed.access_token) {
                            resolve(null);
                            return;
                        }
                        resolve({
                            access_token: parsed.access_token,
                            expires_at: Date.now() + (parsed.expires_in - 60) * 1000
                        });
                    } catch (err) {
                        handleError(err, "Parsing Discord token response");
                        reject(err);
                    }
                });
            }
        );

        request.on("error", reject);
        request.write(body);
        request.end();
    });
}

const MC_INTERVAL_MS = 60000;
const mcStates = {};
const mcTimers = {};

function mcFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "minecraft.json");
}

async function mcLoad(guildId) {
    try {
        const file = mcFile(guildId);
        if (!(await fs.promises.stat(file)).isFile()) return null;
        const data = await fs.promises.readFile(file, "utf8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === "ENOENT") {
            return null;
        }
        handleError(err, `Loading Minecraft state for guild ${guildId}`);
        return null;
    }
}

async function mcSave(guildId, state) {
    try {
        const file = mcFile(guildId);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, state ? JSON.stringify(state) : "null");
    } catch (err) {
        handleError(err, `Saving Minecraft state for guild ${guildId}`);
    }
}

(async () => {
    const dataDir = path.join(__dirname, "../../data");
    try {
        await fs.promises.access(dataDir);
        for (const entry of await fs.promises.readdir(dataDir, {
            withFileTypes: true,
        })) {
            if (!entry.isDirectory()) continue;
            const state = await mcLoad(entry.name);
            if (state) mcStates[entry.name] = state;
        }
    } catch (err) {
        if (err.code !== "ENOENT") {
            handleError(err, "Loading initial Minecraft states");
        }
    }
})();

function fetchServerInfo(ip) {
    return new Promise((resolve, reject) => {
        const request = https.get(`https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`,
            {
                headers: { "User-Agent": "Esraniki" }
            },
            (response) => {
                let data = "";
                response.on("data", (c) => (data += c));
                response.on("end", () => {
                    if (!data.startsWith("{")) {
                        reject(new Error("Invalid API response"));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        resolve({
                            online: parsed.online === true || !parsed.debug?.error,
                            motd: decodeHtmlEntities(parsed.motd?.clean?.join("\n") || "A Minecraft server"),
                            players: {
                                online: parsed.players?.online || 0,
                                max: parsed.players?.max || 0,
                                list: parsed.players?.list || []
                            },
                            version: parsed.version || "Unknown",
                            iconUrl: `https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`
                        });
                    } catch (err) {
                        handleError(err, "Parsing Minecraft server info response");
                        reject(err);
                    }
                });
            }
        );
        request.setTimeout(15000, () => request.destroy(new Error("mcsrvstat.us request timed out")));
        request.on("error", reject);
    });
}

function decodeHtmlEntities(value) {
    const decodeCodePoint = (codePoint, original) =>
        Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : original;

    return String(value ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (match, code) => 
            decodeCodePoint(Number(code), match))
        .replace(/&#x([\da-f]+);/gi, (match, code) => 
            decodeCodePoint(parseInt(code, 16), match));
}

function sanitizeServerAddress(input) {
    return String(input || "")
        .trim()
        .replace(/^[a-z]+:\/\//i, "")
        .split("/")[0]
        .replace(/\s+/g, "");
}

async function getServerInfo(ip, forceRefresh = false) {
    if (!forceRefresh) {
        const cached = mcServerInfoCache.get(ip);
        if (cached) return cached;
    }
    const data = await fetchServerInfo(ip);
    mcServerInfoCache.set(ip, data);
    return data;
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
            const data = await getServerInfo(state.server);
            
            const channel = await client.channels
                .fetch(state.channelId)
                .catch(() => null);
            
            const message = channel ? await channel.messages
                .fetch(state.messageId)
                .catch(() => null) : null;
            
                if (!message) {
                    delete mcStates[guildId];
                    mcSave(guildId, null);
                    clearInterval(mcTimers[guildId]);
                    delete mcTimers[guildId];
                    return;
                }

            await message.edit({ embeds: [await buildMcEmbed(state.server, state.name, data, guildId)] });
        } catch (err) {
            handleError(err, "Minecraft update loop");
        }
    }, MC_INTERVAL_MS);
}

async function buildMcEmbed(ip, name, data, guildId) {
    const embed = new EmbedBuilder()
        .setColor(data.online ? color.GREEN : color.OVERLAY0)
        .setTitle(name)
        .setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`)
        .addFields(
            {
                name: emoji.STATUS + " " + (await lang.locale("minecraft.fields.status", {}, guildId)),
                value: data.online  ? await lang.locale("minecraft.statusOnline", {}, guildId) : await lang.locale("minecraft.statusOffline", {}, guildId),
                inline: true
            },
            {
                name: emoji.USER + " " + (await lang.locale("minecraft.fields.players", {}, guildId)),
                value: `${data.players.online}/${data.players.max}`,
                inline: true
            },
            {
                name: emoji.VERSION + " " + (await lang.locale("minecraft.fields.version", {}, guildId)),
                value: (data.version || (await lang.locale("minecraft.versionUnknown", {}, guildId))).substring(0, 1024),
                inline: true
            }
        )
        .setFooter({ text: await lang.locale("minecraft.lastUpdated", {}, guildId) })
        .setTimestamp();

    if (data.online && data.motd) embed.setDescription(data.motd);

    const players = data.players.list || [];
    if (players.length > 0) {
        const shown = players.slice(0, 10);
        const rest = players.length - shown.length;
        let list = shown.map((p) => `- \`${p.name}\``).join("\n");

        if (rest > 0) list += `\n- ${await lang.locale("minecraft.othersMore", { count: rest }, guildId)}`;
        embed.addFields({
            name: emoji.LIST + " " + (await lang.locale("minecraft.connected", {}, guildId)),
            value: list.substring(0, 1024)
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

            const message = channel ? await channel.messages
                .fetch(state.messageId)
                .catch(() => null) : null;

            if (!message) {
                logger.warn(`(Guild ${guildId}) Minecraft tracking embed not found, keeping state`);
                continue;
            }

            logger.success(`(Guild ${guildId}) Starting Minecraft tracking for '${state.server}'`);
            mcStartInterval(guildId, client);

        } catch (err) {
            handleError(err, `Failed to restore Minecraft state for Guild ${guildId}`);
        }
    }
}

function twitchFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "twitch.json");
}

function normalizeTwitchEntries(config) {
    if (!config || !Array.isArray(config.entries)) throw new Error("Twitch entries must be an array");
    return config.entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") throw new Error(`Invalid Twitch entry ${index + 1}`);
        for (const field of ["twitchChannel", "discordChannelId", "message"]) {
            if (entry[field] != null && typeof entry[field] !== "string") {
                throw new Error(`Invalid ${field} in Twitch entry ${index + 1}`);
            }
        }
        const twitchChannel = (entry.twitchChannel || "").trim().toLowerCase();
        const discordChannelId = (entry.discordChannelId || "").trim();
        const message = (entry.message || "").trim();
        if (!twitchChannel && !discordChannelId && !message) return null;
        if (!/^[a-z0-9_]{1,25}$/.test(twitchChannel)) throw new Error(`Invalid Twitch username in entry ${index + 1}`);
        if (!/^\d{17,20}$/.test(discordChannelId)) throw new Error(`Select a Discord channel for Twitch entry ${index + 1}`);
        if (message.length > 500) throw new Error("Twitch announcement templates must not exceed 500 characters");
        return { id: index + 1, twitchChannel, discordChannelId, message };
    }).filter(Boolean);
}

async function getTwitchDestination(client, guildId, channelId) {
    const channel = await client?.channels.fetch(channelId);
    if (!channel || channel.guildId !== guildId || !channel.isSendable()) {
        throw new Error("Twitch announcements require a sendable channel in the selected guild");
    }
    const sendPermission = channel.isThread() ? "SendMessagesInThreads" : "SendMessages";
    if (!channel.permissionsFor(client.user)?.has(["ViewChannel", sendPermission])) {
        throw new Error("The bot needs permission to view and send messages in the Twitch announcement channel");
    }
    return channel;
}

function formatTwitchAnnouncement(entry, stream) {
    const url = `https://twitch.tv/${entry.twitchChannel}`;
    const template = entry.message || "🔴 {streamer} is now live on Twitch!";
    const values = { streamer: entry.twitchChannel, title: stream?.title || "", game: stream?.game_name || "", url };
    const message = template.replace(/\{(streamer|title|game|url)\}/g, (_, key) => values[key]);
    const content = template.includes("{url}") ? message : `${message}\n${url}`;
    if (content.length <= 2000) return content;
    return `${message.slice(0, 2000 - url.length - 2).replace(/[\uD800-\uDBFF]$/, "")}…\n${url}`;
}

async function loadTwitch(guildId) {
    try {
        const file = twitchFile(guildId);
        if (!(await fs.promises.stat(file)).isFile()) {
            return { entries: [] };
        }
        const data = await fs.promises.readFile(file, "utf8");
        return { entries: normalizeTwitchEntries(JSON.parse(data)) };
    } catch (err) {
        if (err.code === "ENOENT") {
            return { entries: [] };
        }

        handleError(err, `Loading Twitch config for guild ${guildId}`);
        return { entries: [] };
    }
}

async function saveTwitch(guildId, data) {
    const file = twitchFile(guildId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
}

function requestTwitch(options, body) {
    if (Date.now() < twitchRetryAt) return Promise.reject(new Error("Twitch rate limit backoff is active"));
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(value);
        };
        const request = https.request(options, (response) => {
            let data = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => { data += chunk; });
            response.on("error", (error) => finish(error));
            response.on("aborted", () => finish(new Error("Twitch response aborted")));
            response.on("close", () => {
                if (!settled) finish(new Error("Twitch response closed before completion"));
            });
            response.on("end", () => {
                try {
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        const error = new Error(`Twitch ${options.path.split("?")[0]} returned HTTP ${response.statusCode}`);
                        error.status = response.statusCode;
                        if (error.status === 429) {
                            const reset = Number(response.headers["ratelimit-reset"]) * 1000;
                            twitchRetryAt = Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 60000;
                        }
                        finish(error);
                        return;
                    }
                    finish(null, JSON.parse(data));
                } catch (error) {
                    finish(error);
                }
            });
        });
        request.on("error", (error) => finish(error));
        timer = setTimeout(() => {
            const error = new Error("Twitch request timed out");
            finish(error);
            request.destroy(error);
        }, 15000);
        request.end(body);
    });
}

async function fetchTwitchAppToken() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Twitch credentials are not configured");
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials"
    }).toString();
    const parsed = await requestTwitch({
        hostname: "id.twitch.tv",
        path: "/oauth2/token",
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            "User-Agent": "Esraniki"
        }
    }, body);
    if (!parsed || typeof parsed.access_token !== "string" || !parsed.access_token ||
        !Number.isFinite(parsed.expires_in) || parsed.expires_in <= 0) {
        throw new Error("Invalid Twitch token response");
    }
    return {
        access_token: parsed.access_token,
        expires_at: Date.now() + Math.max(1, parsed.expires_in - 60) * 1000
    };
}

async function getTwitchToken() {
    if (!twitchToken || Date.now() >= twitchToken.expires_at) {
        if (!twitchTokenRequest) {
            twitchTokenRequest = fetchTwitchAppToken()
                .then((token) => { twitchToken = token; return token; })
                .finally(() => { twitchTokenRequest = null; });
        }
        return twitchTokenRequest;
    }
    return twitchToken;
}

async function fetchTwitchBatch(endpoint, parameter, logins, retry = true) {
    const token = await getTwitchToken();
    const query = new URLSearchParams();
    for (const login of logins) query.append(parameter, login.toLowerCase());
    let parsed;
    try {
        parsed = await requestTwitch({
            hostname: "api.twitch.tv",
            path: "/helix/" + endpoint + "?" + query,
            method: "GET",
            headers: {
                Authorization: "Bearer " + token.access_token,
                "Client-Id": process.env.TWITCH_CLIENT_ID,
                "User-Agent": "Esraniki"
            }
        });
    } catch (error) {
        if (error.status === 401) {
            if (twitchToken === token) twitchToken = null;
            if (retry) return fetchTwitchBatch(endpoint, parameter, logins, false);
        }
        throw error;
    }
    const loginField = endpoint === "streams" ? "user_login" : "login";
    if (!Array.isArray(parsed?.data) || parsed.data.some((item) => !item || typeof item[loginField] !== "string")) {
        throw new Error(`Invalid Twitch ${endpoint} response`);
    }
    return parsed.data;
}

async function fetchTwitchData(endpoint, parameter, logins) {
    const uniqueLogins = [...new Set(logins.map((login) => login.trim().toLowerCase()).filter(Boolean))];
    const data = [];
    for (let offset = 0; offset < uniqueLogins.length; offset += 100) {
        data.push(...await fetchTwitchBatch(endpoint, parameter, uniqueLogins.slice(offset, offset + 100)));
    }
    return data;
}

function fetchTwitchStreams(channels) {
    return fetchTwitchData("streams", "user_login", channels);
}

function fetchTwitchUsers(logins) {
    return fetchTwitchData("users", "login", logins);
}

async function pollTwitch(client) {
    if (twitchPolling) return;
    twitchPolling = true;
    try {
        await pollTwitchOnce(client);
    } catch (err) {
        handleError(err, "Twitch polling failed");
    } finally {
        twitchPolling = false;
    }
}

async function pollTwitchOnce(client) {
    if (!client) return;
    const dataDir = path.join(__dirname, "../../data");
    try {
        await fs.promises.access(dataDir);
    } catch {
        return;
    }

    for (const entry of await fs.promises.readdir(dataDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const guildId = entry.name;
        try {
            const config = await loadTwitch(guildId);

            if (!config.entries || config.entries.length === 0) continue;
            const twitchChannels = config.entries
                .map((element) => (element.twitchChannel || "").trim())
                .filter(Boolean);

            if (twitchChannels.length === 0) continue;
            const streams = await fetchTwitchStreams(twitchChannels);
            const liveSet = new Set(
                streams.map((stream) => stream.user_login.toLowerCase()),
            );
            for (const element of config.entries) {
                const channel = (element.twitchChannel || "").trim().toLowerCase();
                if (!channel) continue;

                const key = `${guildId}:${channel}:${element.discordChannelId}`;
                const wasLive = twitchLive[key] ?? false;
                const isLive = liveSet.has(channel);

                if (!isLive) {
                    delete twitchLive[key];
                    continue;
                }

                if (isLive && !wasLive) {
                    try {
                        const discordChannel = await getTwitchDestination(client, guildId, element.discordChannelId);
                        const stream = streams.find((stream) => stream.user_login.toLowerCase() === channel);
                        const url = `https://twitch.tv/${element.twitchChannel}`;
                        await discordChannel.send(formatTwitchAnnouncement(element, stream));
                        twitchLive[key] = isLive;
                        logger.success(`(Guild ${guildId}) Twitch announcement sent for '${url}'`);
                    } catch (err) {
                        handleError(err, `Sending Twitch announcement for ${channel} to ${element.discordChannelId} in Guild ${guildId}`);
                    }
                }
            }
        } catch (err) {
            handleError(err, `Twitch poll failed for Guild ${guildId}`);
        }
    }
}

function twitchInit(client) {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
        logger.debug("TWITCH_CLIENT_ID and/or TWITCH_CLIENT_SECRET are not set; Twitch announcements are disabled!");
        return;
    }
    if (twitchTimer) clearInterval(twitchTimer);
    pollTwitch(client);
    twitchTimer = setInterval(() => pollTwitch(client), TWITCH_POLL_INTERVAL_MS);
    logger.debug("Twitch announcement polling started" + ` (${TWITCH_POLL_INTERVAL_MS}MS)`);
}

function shrimpFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "games", "shrimp.json");
}

async function loadShrimp(guildId) {
    try {
        const file = shrimpFile(guildId);
        try {
            await fs.promises.access(file);
            const data = await fs.promises.readFile(file, "utf8");
            return JSON.parse(data);
        } catch (err) {
            if (err.code === "ENOENT") {
                return {};
            }
            throw err;
        }
    } catch (err) {
        handleError(err, `Loading shrimp config for guild ${guildId}`);
        return {};
    }
}

async function saveShrimp(guildId, data) {
    const file = shrimpFile(guildId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
}

async function getShrimpLeaderboard(client, guildId) {
    const config = await loadShrimp(guildId);
    const dayKey = shrimpGame.getDayKey(guildId);
    const userStats = config.userStats || {};
    const entries = Object.entries(userStats).map(([userId, stats]) => ({
        userId,
        total: stats.total || 0,
        today: stats.lastDate === dayKey ? stats.today || 0 : 0,
        firstPassAt: Number.isFinite(stats.firstPassAt) ? stats.firstPassAt : null
    }));

    const byTotal = [...entries].sort((a, b) => b.total - a.total);
    const byToday = entries.filter((entry) => entry.today > 0).sort((a, b) =>
        (a.firstPassAt ?? Infinity) - (b.firstPassAt ?? Infinity) || a.userId.localeCompare(b.userId)
    );
    const totalRank = Object.fromEntries(byTotal.map((entry, index) => [entry.userId, index + 1]));
    const todayRank = Object.fromEntries(byToday.map((entry, index) => [entry.userId, index + 1]));

    const result = [];
    for (const entry of byTotal) {
        let username = entry.userId, avatarURL = null;
        try {
            const guild = client?.guilds?.cache?.get(guildId);
            const member = await guild?.members.fetch(entry.userId).catch(() => null);
            if (member) {
                username = member.user.username;
                avatarURL = member.user.displayAvatarURL({ size: 64, extension: "png" });
            }
        } catch (err) {
            handleError(err, `Fetching member ${entry.userId} for shrimp leaderboard`);
        }
        result.push({
            userId: entry.userId,
            username,
            avatarURL,
            total: entry.total,
            today: entry.today,
            totalRank: totalRank[entry.userId],
            todayRank: todayRank[entry.userId] ?? null
        });
    }
    return result;
}

async function getStatsLeaderboard(client, guildId) {
    const data = await statistics.loadAll(guildId);
    const entries = Object.entries(data).map(([userId, user]) => ({
        userId,
        messages: statistics.sumUser(user, "messages", null),
        vocal: statistics.sumUser(user, "vocal", null)
    }));
    const byMessages = [...entries].sort((a, b) => b.messages - a.messages);
    const byVocal = [...entries].sort((a, b) => b.vocal - a.vocal);
    const msgRank = Object.fromEntries(byMessages.map((entry, index) => [entry.userId, index + 1]));
    const vocalRank = Object.fromEntries(byVocal.map((entry, index) => [entry.userId, index + 1]));
    const result = [];
    for (const entry of byMessages) {
        let username = entry.userId,
            avatarURL = null;
        try {
            const guild = client?.guilds?.cache?.get(guildId);
            const member = await guild?.members
                .fetch(entry.userId)
                .catch(() => null);
            if (member) {
                username = member.user.username;
                avatarURL = member.user.displayAvatarURL({
                    size: 64,
                    extension: "png"
                });
            }
        } catch (err) {
            handleError(err, `Fetching member ${entry.userId} for stats leaderboard`);
        }
        result.push({
            userId: entry.userId,
            username,
            avatarURL,
            messages: entry.messages,
            vocal: entry.vocal,
            msgRank: msgRank[entry.userId],
            vocalRank: vocalRank[entry.userId]
        });
    }
    return result;
}

function rulesFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "rules.json");
}

async function loadRules(guildId) {
    try {
        const file = rulesFile(guildId);
        try {
            await fs.promises.access(file);
            const data = await fs.promises.readFile(file, "utf8");
            return JSON.parse(data);
        } catch (err) {
            if (err.code === "ENOENT") {
                return null;
            }
            throw err;
        }
    } catch (err) {
        handleError(err, `Loading rules for guild ${guildId}`);
        return null;
    }
}

async function saveRules(guildId, state) {
    const file = rulesFile(guildId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(state, null, 2));
}

function buildHeaderEmbed(state) {
    const embed = new EmbedBuilder()
        .setColor(color.ACCENT)
        .setTitle(state.title);
    if (state.description) embed.setDescription(state.description);
    return embed;
}

function buildSectionEmbed(section) {
    const description =
        section.rules.length > 0 ? section.rules
            .map((rule) => `**${section.id}.${rule.id}.** ${rule.text}`)
            .join("\n") : "*-*";

    return new EmbedBuilder()
        .setColor(color.ACCENT)
        .setTitle(`${section.id}. ${section.name}`)
        .setDescription(description);
}

async function postRulesInChannel(state, channel) {
    const headerMessage = await channel.send({ embeds: [buildHeaderEmbed(state)] });
    state.headerMessageId = headerMessage.id;
    
    for (const section of state.sections) {
        const message = await channel.send({ embeds: [buildSectionEmbed(section)] });
        section.messageId = message.id;
    }
}

async function deleteRulesMessages(state, client) {
    if (!state?.channelId) return;
    const channel = await client.channels.fetch(state.channelId).catch(() => null);

    if (!channel) return;
    const ids = [ state.headerMessageId, ...state.sections.map((section) => section.messageId) ].filter(Boolean);

    for (const id of ids) {
        const message = await channel.messages.fetch(id).catch(() => null);
        if (message) await message.delete().catch(() => null);
    }
}

async function syncRules(state, client) {
    if (!client || !state?.channelId) return;
    const channel = await client.channels
        .fetch(state.channelId)
        .catch(() => null);
    if (!channel) return;

    if (state.headerMessageId) {
        const message = await channel.messages
            .fetch(state.headerMessageId)
            .catch(() => null);
        if (message)
            await message
                .edit({ embeds: [buildHeaderEmbed(state)] })
                .catch(() => null);
    }

    for (const section of state.sections) {
        if (section.messageId) {
            const message = await channel.messages
                .fetch(section.messageId)
                .catch(() => null);
            if (message)
                await message
                    .edit({ embeds: [buildSectionEmbed(section)] })
                    .catch(() => null);
            else {
                const newMessage = await channel
                    .send({ embeds: [buildSectionEmbed(section)] })
                    .catch(() => null);
                if (newMessage) section.messageId = newMessage.id;
            }
        } else {
            const message = await channel
                .send({ embeds: [buildSectionEmbed(section)] })
                .catch(() => null);
            if (message) section.messageId = message.id;
        }
    }
}

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const adress of Object.values(interfaces)) {
        for (const ip of adress) {
            if (ip.family === "IPv4" && !ip.internal) return ip.address;
        }
    }
    return "0.0.0.0";
}

function getPublicOrigin() {
    try {
        const url = new URL(process.env.REDIRECT_URI);
        const hostname = url.hostname;
        const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
        if (!hostname || isIp || hostname === "localhost" || hostname === "0.0.0.0") return null;
        return `${url.protocol}//${hostname}`;
    } catch {
        return null;
    }
}

function cpuPercent() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        for (const t in cpu.times) total += cpu.times[t];
        idle += cpu.times.idle;
    }
    return Math.max(0, Math.min(100, 100 - Math.round((idle / total) * 100)));
}

async function getStatus(client) {
    const memory = process.memoryUsage();
    let avatarURL = null, bannerURL = null;

    if (client?.user) {
        avatarURL = client.user.displayAvatarURL({ size: 256, extension: "png" });
        try {
            const fetched = await client.users.fetch(client.user.id, { force: true });
            bannerURL = fetched.bannerURL({ size: 1024, extension: "png" }) ?? null;
        } catch (err) {
            handleError(err, "Fetching app banner");
        }
    }

    return {
        tag: client?.user?.tag ?? null,
        clientId: client?.user?.id ?? null,
        guilds: client?.guilds?.cache?.size ?? null,
        ping: client?.ws?.ping ?? null,
        shards: client?.ws?.shards?.size ?? null,
        uptime: process.uptime(),
        cpu: cpuPercent(),
        memUsed: Math.round(memory.heapUsed / 1024 / 1024),
        memTotal: Math.round(memory.heapTotal / 1024 / 1024),
        node: process.version,
        djs: require("discord.js").version,
        platform: os.platform(),
        version,
        repository: repository?.url ?? null,
        bugs: bugs?.url ?? null,
        funding: funding?.url ?? null,
        avatarURL,
        bannerURL
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
                iconURL: guild.iconURL({ size: 64, extension: "png" }) ?? null
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
            .filter((channel) => channel?.type === 0)
            .map((channel) => ({ id: channel.id, name: channel.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
        handleError(err, `Getting channels for guild ${guildId}`);
        return [];
    }
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "", size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > 512 * 1024) {
                reject(new Error("Request body too large"));
                request.destroy();
                return;
            }
            body += chunk;
        });
        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}

async function serveStatic(pathname, response) {
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const resolvedPath = path.resolve(PUBLIC, relativePath);
    if (!resolvedPath.startsWith(PUBLIC + path.sep) && resolvedPath !== PUBLIC) {
        response.writeHead(403);
        response.end();
        return;
    }
    try {
        const stat = await fs.promises.stat(resolvedPath);
        if (!stat.isFile()) {
            response.writeHead(404);
            response.end();
            return;
        }
        const data = await fs.promises.readFile(resolvedPath);
        const ext = path.extname(resolvedPath);
        response.writeHead(200, {
            "Content-Type": mimeTypes[ext] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        response.end(data);
    } catch (err) {
        if (["ENOENT", "ENOTDIR", "EISDIR"].includes(err.code)) {
            response.writeHead(404);
        } else {
            handleError(err, `Serving static file ${pathname}`);
            response.writeHead(500);
        }
        response.end();
    }
}

function json(response, code, data) {
    response.writeHead(code, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
}

function start(client) {
    const port = parseInt(process.env.DASHBOARD_PORT, 10) || 3000;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        logger.warn("CLIENT_ID and/or CLIENT_SECRET are not set; Dashboard is disabled!");
        return;
    }

    const server = http.createServer(async (request, response) => {
        try {
            const reqUrl = new URL(request.url, "http://localhost");
            const pathname = reqUrl.pathname;
            const guildId = reqUrl.searchParams.get("guild") ?? "";
            const authHeader = request.headers["authorization"];
            const sessionId = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
            const session = sessionId ? sessions.get(sessionId) : null;

            if (pathname === "/api/brand") {
                json(response, 200, {
                    avatarURL: botAvatarURL,
                    version,
                    clientId: clientId ?? null
                });
                return;
            }

            if (pathname === "/api/activity/token" && request.method === "POST") {
                try {
                    const body = JSON.parse(await readBody(request));
                    const code = body.code;
                    if (!code) {
                        json(response, 400, { error: "Missing code" });
                        return;
                    }
                
                    const tokens = await discordTokenExchange(code, null, clientId, clientSecret);
                    if (!tokens?.access_token) {
                        json(response, 400, { error: "auth_failed" });
                        return;
                    }
                
                    const [user, rawGuilds] = await Promise.all([
                        discordGet("/users/@me", tokens.access_token),
                        discordGet("/users/@me/guilds", tokens.access_token)
                    ]);
                
                    const botGuildIds = new Set(client?.guilds?.cache?.keys() ?? []);
                    const guilds = rawGuilds
                        .filter((guild) => hasAdmin(guild.permissions) && botGuildIds.has(guild.id))
                        .map((guild) => ({
                            id: guild.id,
                            name: guild.name,
                            iconURL: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                    
                    if (guilds.length === 0) {
                        json(response, 403, { error: "no_access" });
                        return;
                    }
                
                    const newSessionId = crypto.randomBytes(32).toString("hex");
                    sessions.set(newSessionId, {
                        userId: user.id,
                        username: user.username,
                        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
                        guilds,
                        expiresAt: Date.now() + SESSION_TTL_MS
                    });
                
                    logger.info(`(Activity SDK) New dashboard login: @${user.username} (ID: ${user.id})`);
                
                    json(response, 200, {
                        session: newSessionId,
                        accessToken: tokens.access_token
                    });
                } catch (err) {
                    handleError(err, "Activity token exchange error");
                    json(response, 500, { error: "server_error" });
                }
                return;
            }

            if (pathname === "/auth/login") {
                const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}/auth/callback`;
                const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+guilds`;
                
                response.writeHead(302, { Location: url });
                response.end();
                return;
            }

            if (pathname === "/auth/callback") {
                const code = reqUrl.searchParams.get("code");
                if (!code) {
                    response.writeHead(302, { Location: "/?error=no_code" });
                    response.end();
                    return;
                }
                try {
                    const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}/auth/callback`;
                    const tokens = await discordTokenExchange(
                        code,
                        redirectUri,
                        clientId,
                        clientSecret
                    );

                    if (!tokens.access_token) {
                        response.writeHead(302, { Location: "/?error=auth_failed" });
                        response.end();
                        return;
                    }

                    const [user, rawGuilds] = await Promise.all([
                        discordGet("/users/@me", tokens.access_token),
                        discordGet("/users/@me/guilds", tokens.access_token)
                    ]);

                    const botGuildIds = new Set(client?.guilds?.cache?.keys() ?? []);
                    const guilds = rawGuilds
                        .filter(
                            (guild) =>
                                hasAdmin(guild.permissions) &&
                                botGuildIds.has(guild.id),
                        )
                        .map((guild) => ({
                            id: guild.id,
                            name: guild.name,
                            iconURL: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name));

                    if (guilds.length === 0) {
                        response.writeHead(302, { Location: "/?error=no_access" });
                        response.end();
                        return;
                    }

                    const newSessionId = crypto.randomBytes(32).toString("hex");
                    sessions.set(newSessionId, {
                        userId: user.id,
                        username: user.username,
                        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
                        guilds,
                        expiresAt: Date.now() + SESSION_TTL_MS
                    });
                    
                    logger.info(`New dashboard login: @${user.username} (ID: ${user.id})`);

                    response.writeHead(302, { Location: `/?s=${newSessionId}` });
                    response.end();
                    return;
                } catch (err) {
                    handleError(err, "OAuth callback error");
                    response.writeHead(302, { Location: "/?error=server_error" });
                    response.end();
                    return;
                }
                return;
            }

            if (pathname === "/auth/logout") {
                if (sessionId) sessions.delete(sessionId);
                response.writeHead(302, { Location: "/" });
                response.end();
                return;
            }

            if (!pathname.startsWith("/api/")) {
                await serveStatic(pathname, response);
                return;
            }

            if (!session || session.expiresAt < Date.now()) {
                if (session) sessions.delete(sessionId);
                json(response, 401, { error: "Unauthorized" });
                return;
            }

            if (pathname === "/api/me" && request.method === "GET") {
                json(response, 200, {
                    userId: session.userId,
                    username: session.username,
                    avatar: session.avatar,
                    isOwner: isOwner(session)
                });
                return;
            }

            if (pathname === "/api/logout" && request.method === "POST") {
                sessions.delete(sessionId);
                json(response, 200, {
                    ok: true,
                });
                return;
            }

            if (pathname === "/api/status" && request.method === "GET") {
                json(response, 200, await getStatus(client));
                return;
            }

            if (pathname === "/api/logs" && request.method === "GET") {
                if (!isOwner(session)) {
                    json(response, 403, { error: "Forbidden" });
                    return;
                }
                const since = parseInt( reqUrl.searchParams.get("since") ?? "0", 10 );
                json(response, 200, logger.getLogs(since));
                return;
            }

            if (pathname === "/api/guilds" && request.method === "GET") {
                json(response, 200, session.guilds);
                return;
            }

            if (guildId && !session.guilds.find((g) => g.id === guildId)) {
                json(response, 403, { error: "Access denied" });
                return;
            }

            if (pathname === "/api/channels" && request.method === "GET") {
                json(response, 200, await getChannels(client, guildId));
                return;
            }

            if (pathname === "/api/admins" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
                try {
                    const cached = adminsCache.get(guildId);
                    if (cached !== undefined) {
                        json(response, 200, cached);
                        return;
                    }
                
                    const guild = await client?.guilds.fetch(guildId).catch(() => null);
                    if (!guild) {
                        json(response, 200, []);
                        return;
                    }
                
                    const members = await guild.members.fetch({ time: 15000 }).catch(() => null);
                    if (!members) {
                        json(response, 502, { error: "Failed to fetch guild members" });
                        return;
                    }
                
                    const admins = members
                        .filter((member) => !member.user.bot && member.permissions.has(8n))
                        .map((member) => ({
                            id: member.user.id,
                            username: member.user.username,
                            displayName: member.displayName,
                            avatarURL: member.user.displayAvatarURL({ size: 64, extension: "png" })
                        }))
                        .sort((a, b) => a.displayName.localeCompare(b.displayName));
                    
                    adminsCache.set(guildId, admins);
                    json(response, 200, admins);
                } catch (err) {
                    handleError(err, "Fetching admins");
                    json(response, 500, { error: err.message });
                }
                return;
            }

            if (pathname === "/api/rules" && request.method === "GET") {
                json(response, 200, await loadRules(guildId));
                return;
            }

            if (pathname === "/api/rules" && request.method === "POST") {
                const incoming = JSON.parse(await readBody(request));
                const current = (await loadRules(guildId)) ?? {};
                const newChannelId = incoming.channelId || null;
                const channelChanged = newChannelId && newChannelId !== current.channelId;

                const newState = {
                    ...current,
                    title: incoming.title,
                    description: incoming.description,
                    channelId: newChannelId ?? current.channelId,
                    sections: (incoming.sections ?? []).map((section) => {
                        const existing = current.sections?.find((s) => s.id === section.id);
                        return {
                            id: section.id,
                            name: section.name,
                            messageId: existing?.messageId,
                            rules: section.rules
                        };
                    })
                };

                if (channelChanged && client) {
                    await deleteRulesMessages(current, client);
                    newState.headerMessageId = undefined;
                    for (const state of newState.sections) state.messageId = undefined;
                    const newChannel = await client.channels
                        .fetch(newState.channelId)
                        .catch(() => null);
                    if (newChannel)
                        await postRulesInChannel(newState, newChannel);
                } else if (newState.channelId) {
                    await syncRules(newState, client);
                }

                saveRules(guildId, newState);
                logger.success(`(Guild ${guildId}) Updated configuration: rules.json`);
                json(response, 200, {
                    ok: true,
                    state: newState
                });
                return;
            }

            if (pathname === "/api/stats" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }

                const cachedLeaderboard = statsLeaderboardCache.get(guildId);
                if (cachedLeaderboard !== undefined) {
                    json(response, 200, cachedLeaderboard);
                    return;
                }

                const leaderboardData = await getStatsLeaderboard(client, guildId);
                statsLeaderboardCache.set(guildId, leaderboardData);
                    json(response, 200, leaderboardData);
                    return;
            }

            if (pathname === "/api/stats/user" && request.method === "POST") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }

                const userId = reqUrl.searchParams.get("user");
                if (!userId) {
                    json(response, 400, { error: "Missing user" });
                    return;
                }
                
                const user = await statistics.loadUser(guildId, userId);
                if (!user.messages) user.messages = {};
                if (!user.vocal) user.vocal = {};
                
                const body = JSON.parse(await readBody(request));
                const messages = Math.max(0, Math.round(body.messages ?? 0));
                const vocal = Math.max(0, Math.round(body.vocal ?? 0));
                user.messages.total = messages;
                user.vocal.total = vocal;

                await statistics.saveUser(guildId, userId, user);
                logger.success(`(Guild ${guildId}) Saved statistics for user ${userId} (M: ${messages}, V: ${vocal}s)`);

                json(response, 200, { ok: true });
                return;
            }

            if (pathname === "/api/stats/user" && request.method === "DELETE") {
                if (!guildId) {
                    json(response, 400, {
                        error: "Missing guild"
                    });
                    return;
                }

                const userId = reqUrl.searchParams.get("user");
                if (!userId) {
                    json(response, 400, { error: "Missing user" });
                    return;
                }

                await statistics.deleteUser(guildId, userId);
                logger.success(`(Guild ${guildId}) Deleted statistics of user ${userId}`);
                json(response, 200, { ok: true });
                return;
            }

            if (pathname === "/api/settings" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                const cachedLanguage = langCache.get(guildId);
                let language = cachedLanguage;
                if (language === undefined) {
                    language = await lang.getLanguage(guildId);
                    langCache.set(guildId, language);
                }
            
                json(response, 200, {
                    supported: lang.supported,
                    language,
                    debug: appSettings.getDebug(),
                    timezone: appSettings.getTimezone(guildId),
                    use24h: appSettings.getUse24h(guildId)
                });
                return;
            }

            if (pathname === "/api/settings" && request.method === "POST") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                const body = JSON.parse(await readBody(request));
                if (body.language) lang.setLanguage(body.language, guildId);
            
                const patch = {};
                if (typeof body.timezone === "string") patch.timezone = body.timezone;
                if (typeof body.use24h === "boolean") patch.use24h = body.use24h;
                if (Object.keys(patch).length) appSettings.updateGuildSettings(guildId, patch);
            
                if (typeof body.debug === "boolean" && isOwner(session)) {
                    appSettings.setDebug(body.debug);
                    logger.info(`Debug mode ${body.debug ? "enabled" : "disabled"}`);
                }
            
                json(response, 200, { ok: true });
                return;
            }

            if (pathname === "/api/minecraft" && request.method === "GET") {
                const state = mcStates[guildId];
                json(
                    response,
                    200,
                    state ? { 
                        tracking: true,
                        server: state.server,
                        name: state.name,
                        channelId: state.channelId,
                        messageId: state.messageId
                    } : {
                        tracking: false
                    }
                );
                return;
            }

            if (pathname === "/api/minecraft/status" && request.method === "GET") {
                const state = mcStates[guildId];
                if (!state) {
                    json(response, 200, null);
                    return;
                }
                try {
                    const data = await getServerInfo(state.server);
                    json(response, 200, data);
                } catch (err) {
                    handleError(err, `Fetching Minecraft server info for ${state.server}`);
                    json(response, 502, { error: err.message });
                }
                return;
            }

            if (pathname === "/api/minecraft/fetch" && request.method === "POST") {
                const body = JSON.parse(await readBody(request));
                const ip = sanitizeServerAddress(body.ip);
                if (!ip) {
                    json(response, 400, { error: "Missing ip" });
                    return;
                }
                try {
                    json(response, 200, await getServerInfo(ip));
                } catch (err) {
                    handleError(err, `Fetching server info for ${ip}`);
                    json(response, 502, { error: err.message });
                }
                return;
            }

            if (pathname === "/api/minecraft/track" && request.method === "POST") {
                const body = JSON.parse(await readBody(request));
                const ip = sanitizeServerAddress(body.ip);
                const name = (body.name || ip).trim();
                const channelId = (body.channelId || "").trim();
                if (!ip || !channelId) {
                    json(response, 400, { error: "Missing ip or channelId" });
                    return;
                }

                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }

                if (!client) {
                    json(response, 503, { error: "Bot not ready" });
                    return;
                }
                try {
                    const data = await getServerInfo(ip);
                    const channel = await client.channels
                        .fetch(channelId)
                        .catch(() => null);
                    if (!channel) {
                        json(response, 404, { error: "Channel not found" });
                        return;
                    }

                    const previous = mcStates[guildId];
                    if (previous) {
                        const oldChannel = await client.channels
                            .fetch(previous.channelId)
                            .catch(() => null);
                        const oldMessage = oldChannel ? await oldChannel.messages
                            .fetch(previous.messageId)
                            .catch(() => null) : null;
                        if (oldMessage) await oldMessage.delete().catch(() => null);
                    }

                    if (mcTimers[guildId]) {
                        clearInterval(mcTimers[guildId]);
                        delete mcTimers[guildId];
                    }

                    const messages = await channel.send({ embeds: [await buildMcEmbed(ip, name, data, guildId)] });
                    const state = {
                        server: ip,
                        name,
                        channelId: channel.id,
                        messageId: messages.id
                    };

                    mcStates[guildId] = state;
                    mcSave(guildId, state);
                    mcStartInterval(guildId, client);

                    logger.success(`(Guild ${guildId}) Started Minecraft tracking for '${ip}'`);

                    json(response, 200, { ok: true, state, data });
                } catch (err) {
                    handleError(err, `Setting up Minecraft tracking for ${ip}`);
                    json(response, 502, { error: err.message });
                }
                return;
            }

            if (
                pathname === "/api/minecraft/untrack" &&
                request.method === "POST"
            ) {
                const state = mcStates[guildId];
                if (!state) {
                    response.writeHead(200, { ok: true });
                    response.end();
                    return;
                }

                if (client) {
                    const channel = await client.channels
                        .fetch(state.channelId)
                        .catch(() => null);
                    const message = channel ? await channel.messages
                        .fetch(state.messageId)
                        .catch(() => null) : null;
                    if (message) await message.delete().catch(() => null);
                }

                if (mcTimers[guildId]) {
                    clearInterval(mcTimers[guildId]);
                    delete mcTimers[guildId];
                }

                delete mcStates[guildId];
                mcSave(guildId, null);

                logger.success(`(Guild ${guildId}) Stopped Minecraft tracking`);

                response.writeHead(200, { ok: true });
                response.end();
                return;
            }

            if (
                pathname === "/api/minecraft/refresh" &&
                request.method === "POST"
            ) {
                const state = mcStates[guildId];
                if (!state) {
                    json(response, 404, { error: "Not tracking" });
                    return;
                }
                if (!client) {
                    json(response, 503, { error: "Bot not ready" });
                    return;
                }
                try {
                    const data = await getServerInfo(state.server, true);
                    const channel = await client.channels
                        .fetch(state.channelId)
                        .catch(() => null);
                    const message = channel ? await channel.messages
                        .fetch(state.messageId)
                        .catch(() => null) : null;
                    if (message) {
                        await message.edit({
                            embeds: [
                                await buildMcEmbed(
                                    state.server,
                                    state.name,
                                    data,
                                    guildId
                                ),
                            ],
                        });
                    }

                    logger.success(`(Guild ${guildId}) Refreshed Minecraft tracker for '${state.server}'`);

                    json(response, 200, { ok: true, data });
                } catch (err) {
                    handleError(err, `Refreshing Minecraft embed for ${state.server}`);
                    json(response, 502, { error: err.message });
                }
                return;
            }

            if (pathname === "/api/twitch/avatars" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                const config = await loadTwitch(guildId);
                const logins = (config.entries ?? [])
                    .map((element) => (element.twitchChannel || "").trim())
                    .filter(Boolean);
            
                if (logins.length === 0) {
                    json(response, 200, {});
                    return;
                }
                try {
                    const users = await fetchTwitchUsers(logins);
                    const result = {};
                    for (const user of users)
                        result[user.login.toLowerCase()] = user.profile_image_url;
                
                    json(response, 200, result);
                } catch (err) {
                    handleError(err, `Fetching Twitch avatars for guild ${guildId}`);
                    json(response, 502, { error: err.message });
                }
                return;
            }
            
            if (pathname === "/api/twitch" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
                json(response, 200, await loadTwitch(guildId));
                return;
            }
            
            if (pathname === "/api/twitch" && request.method === "POST") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                let entries;
                try {
                    entries = normalizeTwitchEntries(JSON.parse(await readBody(request)));
                    for (const entry of entries) {
                        await getTwitchDestination(client, guildId, entry.discordChannelId);
                    }
                } catch (error) {
                    json(response, 400, { error: error.message });
                    return;
                }
                
                await saveTwitch(guildId, { entries });
                
                logger.success(`(Guild ${guildId}) Updated configuration: twitch.json`);
                
                json(response, 200, { ok: true, entries });
                return;
            }

            if (pathname === "/api/games/shrimp" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
                const config = await loadShrimp(guildId);
                json(response, 200, {
                    channelId: config.channelId ?? null,
                    gifUrl: config.gifUrl ?? null
                });
                return;
            }
            
            if (pathname === "/api/games/shrimp" && request.method === "POST") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                const body = JSON.parse(await readBody(request));
                const current = await loadShrimp(guildId);
                const channelId = (body.channelId || "").trim() || null;
                const gifUrl = (body.gifUrl || "").trim() || null;
            
                if (gifUrl && (!/^https?:\/\//i.test(gifUrl) || !/\.gif(\?|$)/i.test(gifUrl))) {
                    json(response, 400, { error: "Invalid GIF URL" });
                    return;
                }
            
                const updated = { ...current, channelId, gifUrl };
                await saveShrimp(guildId, updated);
            
                logger.success(`(Guild ${guildId}) Updated configuration: shrimp.json`);
            
                json(response, 200, { ok: true, channelId, gifUrl });
                return;
            }
            
            if (pathname === "/api/games/shrimp/leaderboard" && request.method === "GET") {
                if (!guildId) {
                    json(response, 400, { error: "Missing guild" });
                    return;
                }
            
                const dayKey = shrimpGame.getDayKey(guildId);
                response.setHeader("X-Shrimp-Reset-At", Date.now() + shrimpGame.getMsUntilReset(guildId));
                response.setHeader("Cache-Control", "no-store");
                const cached = shrimpLeaderboardCache.get(guildId);
                if (cached !== undefined && cached.dayKey === dayKey) {
                    json(response, 200, cached.leaderboard);
                    return;
                }
            
                const leaderboard = await getShrimpLeaderboard(client, guildId);
                shrimpLeaderboardCache.set(guildId, { dayKey, leaderboard });
                json(response, 200, leaderboard);
                return;
            }

            response.writeHead(404, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "Not found" }));
        } catch (err) {
            handleError(err, "Dashboard request error");
            
            if (!response.headersSent) {
                response.writeHead(500, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ error: "Internal server error" }));
            }
        }
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            logger.error(`Dashboard port ${port} is already in use!`);
        } else {
            logger.error("Dashboard server error: " + err.message);
        }
    });

    server.listen(port, "0.0.0.0", () => {
        const publicOrigin = getPublicOrigin();
        const localUrl = `http://${getLocalIPv4()}:${port}`;
        logger.success(`Dashboard running at ${publicOrigin ?? localUrl}`);
    });

    if (client) {
        const onReady = () => {
            botAvatarURL = client.user.displayAvatarURL({
                size: 256,
                extension: "png"
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
    start
};
