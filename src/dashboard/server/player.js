function failure(status, message) {
    return [status, { error: message }];
}

async function saveSettings({ guild, body, settings, engine }) {
    const patch = {};
    for (const key of ['autoDisconnect', 'autoDisconnectSeconds', 'readOnlyChannel']) {
        if (Object.hasOwn(body, key)) patch[key] = body[key];
    }
    if (Object.hasOwn(body, "enabled")) {
        if (typeof body.enabled !== "boolean") return failure(400, "Enabled must be true or false");
        patch.enabled = body.enabled;
    }
    if (Object.hasOwn(body, "announcementChannelId")) {
        const id = body.announcementChannelId;
        if (id !== null) {
            if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return failure(400, "Invalid announcement channel");
            const channel = await guild.channels.fetch(id).catch(() => null);
            if (!channel || channel.guildId !== guild.id || channel.type !== 0) {
                return failure(400, "Select a text channel in this server");
            }
            if (!channel.permissionsFor(guild.members.me)?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
                return failure(400, "The bot needs permission to view this channel, send messages, and embed links");
            }
        }
        patch.announcementChannelId = id;
    }
    if (!Object.keys(patch).length) return failure(400, "No player settings supplied");
    settings.set(guild.id, patch);
    if (patch.enabled === false) await engine.end(guild.id);
    else if ('autoDisconnect' in patch || 'autoDisconnectSeconds' in patch) engine.refreshIdleTimer(guild.id);
    if ('announcementChannelId' in patch) engine.emit('update', guild.id, engine.snapshot(guild.id));
    return [200, { ok: true, ...settings.get(guild.id) }];
}

async function playerRequest({ pathname, method, guildId, session, client, readBody, engine, settings, getAnnouncementWarning }) {
    if (!guildId) return failure(400, "Missing guild");
    const grant = session.guilds.find((entry) => entry.id === guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!grant || !guild) return failure(403, "Access denied");
    if (!guild.available) return failure(503, "Discord server is temporarily unavailable");

    let member;
    try {
        member = await guild.members.fetch(session.userId);
    } catch (error) {
        if (error.code === 10007 || error.code === 10004) return failure(403, "Access denied");
        return failure(503, "Could not verify your Discord membership");
    }

    const isAdmin = grant.isAdmin && member.permissions.has(8n);
    const config = settings.get(guildId);
    if (method === "GET" && pathname === "/api/player") {
        let reason = null;
        try {
            engine.authorize({ guild, member });
        } catch (error) {
            if (!error.status && !error.statusCode) throw error;
            reason = error.message;
        }
        const snapshot = reason === null ? engine.snapshot(guildId) : null;
        return [200, {
            enabled: config.enabled,
            ...(isAdmin ? { announcementChannelId: config.announcementChannelId,
                readOnlyChannel: config.readOnlyChannel,
                autoDisconnect: config.autoDisconnect, autoDisconnectSeconds: config.autoDisconnectSeconds } : {}),
            canControl: reason === null,
            reason,
            channelName: reason === null ? member.voice.channel?.name ?? null : null,
            snapshot,
            announcementWarning: snapshot?.sessionId ? getAnnouncementWarning(guildId, snapshot.sessionId) : null
        }];
    }

    if (method !== "POST") return failure(405, "Unsupported method");
    if (!["/api/player/settings", "/api/player/search", "/api/player/enqueue", "/api/player/control"].includes(pathname)) {
        return failure(404, "Unknown player operation");
    }
    if (pathname === "/api/player/settings" && !isAdmin) return failure(403, "Administrator access required");
    let body;
    try {
        body = JSON.parse(await readBody());
    } catch (error) {
        if (error.status === 413) return failure(413, "Request body too large");
        return failure(400, "Invalid request body");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure(400, "Invalid request body");

    try {
        if (pathname === "/api/player/settings") {
            return await saveSettings({ guild, body, settings, engine });
        }
        engine.authorize({ guild, member });
        if (pathname === "/api/player/control") {
            const { action, value, sessionId } = body;
            const snapshot = await engine.control({ guild, member, action, value, sessionId });
            return [200, { snapshot }];
        }
        if (typeof body.query !== "string" || !body.query.trim()) return failure(400, "Enter a track link, playlist link, or search term");
        const { source = "youtube" } = body;
        const globalSearch = pathname === "/api/player/search" && source === "global";
        if (!globalSearch && !["youtube", "soundcloud"].includes(source)) return failure(400, "Unknown music source");
        const query = body.query.trim();
        if (pathname === "/api/player/search") {
            if (Object.hasOwn(body, "batch")) return [200, await engine.searchBatch(query, source, body.batch)];
            const tracks = await engine.search(query, source);
            return [200, { tracks }];
        }
        const counts = await engine.enqueue({ guild, member, query, source });
        return [200, counts];
    } catch (error) {
        const status = error.status ?? error.statusCode;
        if (!Number.isInteger(status) || status < 400 || status > 599) throw error;
        return failure(status, error.message);
    }
}

module.exports = { playerRequest };
