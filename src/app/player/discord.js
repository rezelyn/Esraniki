const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Events,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    PermissionFlagsBits,
    escapeMarkdown,
    userMention,
} = require('discord.js');
const engine = require('./engine');
const settings = require('./settings');
const { guildLocale } = require('../../utils/lang');
const { color, emoji } = require('../../utils/style');
const logger = require('../../utils/logger');

const MAX_VOLUME = 200;
const VOLUME_STEPS = new Map([
    ['louder', 10],
    ['quieter', -10],
]);
const QUEUE_ACTIONS = new Set(['queue', 'queuePrev', 'queueNext']);
const QUEUE_PAGE_LINES = 10;
const QUEUE_PAGE_CHARS = 1800;

// Discord API error codes
const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;
const CHANNEL_UNUSABLE = new Set([
    UNKNOWN_CHANNEL,
    MISSING_ACCESS,
    MISSING_PERMISSIONS,
]);

const REQUIRED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
];
const allowedMentions = { parse: [] };

const panels = new Map();
const failedAnnouncements = new Map();
const pending = new Map();
const workers = new Map();
const queueViews = new Map();

const playbackStyle = {
    loading: { accent: color.YELLOW, icon: emoji.UPTIME },
    playing: { accent: color.GREEN, icon: emoji.PLAY },
    paused: { accent: color.PEACH, icon: emoji.PAUSE },
    stopped: { accent: color.RED, icon: emoji.STOP },
};
const controlEmoji = {
    previous: emoji.SKIP_PREVIOUS,
    pause: emoji.PAUSE,
    resume: emoji.PLAY,
    skip: emoji.SKIP_NEXT,
    shuffle: emoji.SHUFFLE,
    repeat: emoji.REPEAT,
    queue: emoji.QUEUE,
    clear: emoji.DELETE,
    stop: emoji.STOP,
    quieter: emoji.VOLUME_DOWN,
    louder: emoji.VOLUME_UP,
    queuePrev: emoji.NAV_PREVIOUS,
    queueNext: emoji.NAV_NEXT,
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const clean = (text) => escapeMarkdown(String(text).replace(/\s+/g, ' '));

function formatRequester(track) {
    if (track?.requesterId) return userMention(track.requesterId);
    return track?.requester ? clean(track.requester) : null;
}

function formatTrackTitle(track) {
    const title = clean(track.title).replace(/[\[\]]/g, '\\$&');
    return `**[${title}](<${track.url}>)**`;
}

function formatDuration(duration) {
    if (!Number.isFinite(duration)) return '-';
    const seconds = Math.floor(duration);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function button(sessionId, action, { style, disabled } = {}) {
    return new ButtonBuilder()
        .setCustomId(['player', sessionId, action].join(':'))
        .setEmoji(controlEmoji[action])
        .setStyle(style ?? ButtonStyle.Secondary)
        .setDisabled(Boolean(disabled));
}

function getAnnouncementWarning(guildId, sessionId) {
    if (!sessionId || failedAnnouncements.get(guildId) !== sessionId)
        return null;
    return 'The bot could not post or update the Now Playing embed. Check permissions.';
}

async function describeError(error, t) {
    if (error?.code) {
        const key = `player.errors.${error.code}`;
        const translated = await t(key);
        if (translated !== key) return translated;
    }
    logger.warn(`Player request failed (${error?.code || 'unknown'})`);
    return t('player.failed');
}

async function queueContainer(snapshot, view, t) {
    const [heading, emptyText] = await Promise.all([
        t('player.actions.queue'),
        t('player.queueEmpty'),
    ]);

    const pages = [[]];
    let size = 0;
    for (const [i, track] of snapshot.queue.entries()) {
        const requester = track.requesterId ? ` (${userMention(track.requesterId)})` : '';
        const line = `${i + 1}. ${formatTrackTitle(track)}${requester}`;
        let page = pages.at(-1);
        if (
            page.length &&
            (page.length >= QUEUE_PAGE_LINES ||
                size + line.length > QUEUE_PAGE_CHARS)
        ) {
            page = [];
            pages.push(page);
            size = 0;
        }
        page.push(line);
        size += line.length + 1;
    }

    view.page = clamp(view.page, 0, pages.length - 1);
    const body = pages[view.page].join('\n') || emptyText;
    const container = new ContainerBuilder()
        .setAccentColor(color.BASE)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${emoji.QUEUE} ${heading}\n${body}`,
            ),
        );
    if (pages.length > 1) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                button(snapshot.sessionId, 'queuePrev', {
                    disabled: view.page === 0,
                }),
                ...[String(view.page + 1), '/', String(pages.length)].map((label, index) => new ButtonBuilder()
                    .setCustomId(`player:${snapshot.sessionId}:queueSpacer${index + 1}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(label)
                    .setDisabled(true)),
                button(snapshot.sessionId, 'queueNext', {
                    disabled: view.page === pages.length - 1,
                }),
            ),
        );
    }
    return container;
}

async function describeTrack(current, t) {
    const [durationLabel, artistLabel, sourceLabel, unknownArtist] =
        await Promise.all([
            t('player.duration'),
            t('player.artist'),
            t('player.source'),
            current.artist ? null : t('player.unknownArtist'),
        ]);
    return [
        `${emoji.UPTIME} **${durationLabel}** ${formatDuration(current.duration)}`,
        `${emoji.USER} **${artistLabel}** ${clean(current.artist || unknownArtist)}`,
        `${emoji.LINK} **${sourceLabel}** [${current.source === 'soundcloud' ? 'SoundCloud' : 'YouTube'}](<${current.url}>)`,
    ].join(' • ');
}

async function render(guildId, snapshot) {
    const t = guildLocale(guildId);
    const { volume, queue, sessionId, state } = snapshot;
    const displayState = sessionId && Object.hasOwn(playbackStyle, state) ? state : 'stopped';
    const current = displayState === 'stopped' ? null : snapshot.current;
    const { accent, icon } = playbackStyle[displayState];

    const requester = formatRequester(current);
    const [label, volumeText, queuedText, byText] = await Promise.all([
        t(`player.${displayState}`),
        t('player.volume', { volume }),
        t('player.queued', { count: queue.length }),
        requester && t('player.by', { user: requester }),
    ]);

    const lines = [`### ${icon} ${label}`];
    if (current) lines.push(formatTrackTitle(current));

    const container = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lines.join('\n')),
        );
    if (current?.thumbnail) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(current.thumbnail),
            ),
        );
    }

    if (current) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(await describeTrack(current, t)),
        );
    }

    const footer = [volumeText];
    if (byText) footer.push(byText);
    footer.push(queuedText);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${footer.join(' • ')}`),
    );

    const view = queueViews.get(guildId);
    const showQueue = Boolean(sessionId) && view?.sessionId === sessionId;
    // [action, disabled, active]
    const rows = [
        [
            ['shuffle', false, snapshot.shuffle],
            ['previous', !snapshot.hasPrevious],
            [state === 'paused' ? 'resume' : 'pause', !current || state === 'loading'],
            ['skip', !snapshot.current],
            ['repeat', false, snapshot.repeat],
        ],
        [
            ['queue', false, showQueue],
            ['clear', !queue.length],
            ['stop'],
            ['quieter', volume === 0],
            ['louder', volume >= MAX_VOLUME],
        ],
    ];
    container.addActionRowComponents(
        ...rows.map((row) =>
            new ActionRowBuilder().addComponents(
                row.map(([action, disabled, active]) =>
                    button(sessionId, action, {
                        style:
                            action === 'stop'
                                ? ButtonStyle.Danger
                                : active
                                  ? ButtonStyle.Primary
                                  : ButtonStyle.Secondary,
                        disabled: !sessionId || disabled,
                    }),
                ),
            ),
        ),
    );

    const containers = [container];
    if (showQueue) containers.push(await queueContainer(snapshot, view, t));
    return {
        flags: MessageFlags.IsComponentsV2,
        components: containers,
        allowedMentions,
    };
}

async function upsertPanel(channel, message, savedId, payload, canCreate) {
    try {
        message ??= savedId ? await channel.messages.fetch(savedId) : null;
        if (message) await message.edit({ ...payload, embeds: [] });
    } catch (err) {
        if (CHANNEL_UNUSABLE.has(err.code)) return null;
        if (err.code !== UNKNOWN_MESSAGE) throw err;
        message = null;
    }
    if (message || !canCreate) return message;
    try {
        return await channel.send(payload);
    } catch (err) {
        if (CHANNEL_UNUSABLE.has(err.code)) return null;
        throw err;
    }
}

async function syncPanel(client, guildId, snapshot, interaction) {
    failedAnnouncements.delete(guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const configured = settings.get(guildId).announcementChannelId;
    const saved = settings.getPanels(guildId);
    const previous = panels.get(guildId);
    const fallback =
        snapshot.channelId || previous?.channelId || Object.keys(saved).at(-1);
    const candidates = new Set([configured, fallback].filter(Boolean));
    const canCreate = Boolean(configured || snapshot.sessionId);
    const started = performance.now();
    const payload = await render(guildId, snapshot);
    const signature = JSON.stringify(payload.components);
    const rendered = performance.now();

    for (const id of candidates) {
        const channel = guild.channels.cache.get(id);
        if (
            !channel?.isSendable() ||
            !channel.permissionsFor(guild.members.me)?.has(REQUIRED_PERMISSIONS)
        )
            continue;

        const existing = previous?.channelId === id ? previous.message : null;
        const direct = interaction && existing?.id === interaction.message.id;
        if (interaction && !direct) {
            await interaction.deferUpdate();
            interaction = null;
        }
        if (existing && previous.signature === signature) {
            if (direct) await interaction.deferUpdate();
            return;
        }
        if (direct) {
            try {
                await interaction.update(payload);
                previous.signature = signature;
                logger.debug(`[Audio Player] guild=${guildId} queue render=${Math.round(rendered - started)}ms callback=${Math.round(performance.now() - rendered)}ms`);
                return;
            } catch (err) {
                logger.warn(`Queue interaction update failed in guild ${guildId} (${err.code || err.name}), retrying via panel edit`);
                interaction = null;
            }
        }
        const message = await upsertPanel(
            channel,
            existing,
            saved[id],
            payload,
            canCreate,
        );
        if (!message) continue;

        const panel = { channelId: id, message };
        panels.set(guildId, panel);
        settings.rememberPanel(guildId, id, message.id);
        panel.signature = signature;
        logger.debug(`[Audio Player] guild=${guildId} panel state=${snapshot.state} render=${Math.round(rendered - started)}ms delivery=${Math.round(performance.now() - rendered)}ms`);
        if (previous && previous.channelId !== id) {
            const idle = {
                sessionId: null,
                state: 'idle',
                current: null,
                volume: snapshot.volume,
                queue: [],
            };
            await previous.message
                .edit({ ...(await render(guildId, idle)), embeds: [] })
                .catch(() => {});
        }
        return;
    }
    if (interaction) await interaction.deferUpdate();
    if (snapshot.sessionId) failedAnnouncements.set(guildId, snapshot.sessionId);
}

function hasPlayerControl(component) {
    return (
        component.customId?.startsWith('player:') ||
        component.components?.some(hasPlayerControl)
    );
}

const isPlayerMessage = (message) =>
    message.components?.some(hasPlayerControl) ||
    settings.getPanels(message.guildId)[message.channelId] === message.id ||
    message.interaction?.commandName === 'play';

async function moderateMessage(message) {
    if (!message.guildId) return false;
    const config = settings.get(message.guildId);
    if (
        !config.readOnlyChannel ||
        message.channelId !== config.announcementChannelId
    )
        return false;
    if (message.author.id === message.client.user.id && isPlayerMessage(message))
        return true;
    if (message.deletable) {
        await message.delete().catch((err) => {
            if (err.code !== UNKNOWN_MESSAGE)
                logger.warn(
                    `Could not delete message in player channel ${message.channelId}`,
                );
        });
    }
    return true;
}

async function drain(client, guildId, interaction) {
    try {
        while (pending.has(guildId)) {
            const next = pending.get(guildId);
            pending.delete(guildId);
            try {
                await syncPanel(client, guildId, next, interaction);
            } catch (err) {
                if (next.sessionId && next.state !== 'idle')
                    failedAnnouncements.set(guildId, next.sessionId);
                logger.warn(
                    `Could not update playback message in guild ${guildId} (${err.code || err.name})`,
                );
            }
            interaction = null;
        }
    } finally {
        workers.delete(guildId);
    }
}

function updatePanel(client, guildId, snapshot, interaction) {
    if (queueViews.get(guildId)?.sessionId !== snapshot.sessionId)
        queueViews.delete(guildId);
    pending.set(guildId, snapshot);
    if (!workers.has(guildId)) workers.set(guildId, drain(client, guildId, interaction));
    return workers.get(guildId);
}

async function handleButton(interaction) {
    const { guildId, member } = interaction;
    const t = guildLocale(guildId);
    const [, sessionId, action] = interaction.customId.split(':');
    const direct = QUEUE_ACTIONS.has(action) && !workers.has(guildId);
    if (!direct) {
        const started = performance.now();
        await interaction.deferUpdate();
        logger.debug(`[Audio Player] guild=${guildId} action=${action} ack=${Math.round(performance.now() - started)}ms`);
    }
    const reply = (content) =>
        interaction[direct ? 'reply' : 'followUp']({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions,
        });

    const snapshot = engine.snapshot(guildId);
    if (
        !snapshot.sessionId ||
        sessionId !== snapshot.sessionId ||
        panels.get(guildId)?.message.id !== interaction.message.id
    )
        return reply(await t('player.stale'));
    if (!settings.get(guildId).enabled)
        return reply(await t('player.disabled'));
    if (
        !member.voice?.channelId ||
        member.voice.channelId !== snapshot.channelId
    )
        return reply(await t('player.sameChannel'));

    if (QUEUE_ACTIONS.has(action)) {
        const view = queueViews.get(guildId);
        const open = view?.sessionId === sessionId;
        if (action === 'queue') {
            if (open) queueViews.delete(guildId);
            else queueViews.set(guildId, { sessionId, page: 0 });
        } else if (open) {
            view.page += action === 'queueNext' ? 1 : -1;
        }
        return updatePanel(interaction.client, guildId, snapshot, direct ? interaction : null);
    }

    const step = VOLUME_STEPS.get(action);
    try {
        await engine.control({
            guild: interaction.guild,
            member,
            sessionId,
            action: step === undefined ? action : 'volume',
            value:
                step === undefined
                    ? undefined
                    : clamp(snapshot.volume + step, 0, MAX_VOLUME),
        });
    } catch (err) {
        await reply(await describeError(err, t));
    }
}

function forgetGuild(guildId) {
    panels.delete(guildId);
    queueViews.delete(guildId);
    failedAnnouncements.delete(guildId);
}

function start(client) {
    client.on(Events.MessageDelete, (message) => {
        const panel = panels.get(message.guildId);
        if (panel?.message.id === message.id) delete panel.signature;
    });
    client.once(Events.ClientReady, () => {
        for (const { id } of client.guilds.cache.values()) {
            if (
                settings.get(id).announcementChannelId ||
                Object.keys(settings.getPanels(id)).length
            ) {
                updatePanel(client, id, engine.snapshot(id));
            }
        }
    });
    engine.on('update', (guildId, snapshot) =>
        updatePanel(client, guildId, snapshot),
    );
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        try {
            await engine.voiceUpdate(oldState, newState);
        } catch {
            logger.warn(`Failed to process voice change in guild ${newState.guild.id}`);
        }
    });
    client.on(Events.GuildDelete, async (guild) => {
        try {
            await engine.end(guild.id);
        } catch {
            logger.warn(`Failed to close player in guild ${guild.id}`);
        } finally {
            forgetGuild(guild.id);
        }
    });
}

async function shutdown() {
    await engine.shutdown();
    await Promise.allSettled(workers.values());
}

module.exports = {
    start,
    shutdown,
    handleButton,
    describeError,
    getAnnouncementWarning,
    moderateMessage,
};
