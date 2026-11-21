function mutualGuilds(rawGuilds, client) {
    return rawGuilds
        .filter((guild) => client?.guilds.cache.has(guild.id))
        .map((guild) => ({
            id: guild.id,
            name: guild.name,
            iconURL: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
            isAdmin: (BigInt(guild.permissions) & 8n) === 8n
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function canManage(session, guildId, client) {
    for (const grant of session.guilds) {
        if (!grant.isAdmin || (guildId && grant.id !== guildId)) continue;
        const guild = client?.guilds.cache.get(grant.id);
        if (!guild?.available) continue;
        const member = await guild.members.fetch(session.userId).catch(() => null);
        if (member?.permissions.has(8n)) return true;
    }
    return false;
}

function isOwner(session) {
    const ownerId = (process.env.OWNER_ID || "").trim();
    return Boolean(ownerId) && session.userId === ownerId;
}

module.exports = { mutualGuilds, canManage, isOwner };
