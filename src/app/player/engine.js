const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const media = require('./provider');
const playerSettings = require('./settings');
const logger = require('../../utils/logger');

const { failure } = media;
const aloneMs = 60000;
const maxQueue = 100;
const maxHistory = 100;
const maxPending = 5;
const voiceReadyMs = 20000;
const cachedHistory = 2;
const guildVoiceChannel = 2; // ChannelType.GuildVoice

const stale = () =>
    failure('STALE_SESSION', 409, 'The playback session has changed.');
const idle = () =>
    failure('PLAYER_IDLE', 409, 'There is nothing to control right now.');
const invalidAction = () =>
    failure('INVALID_ACTION', 400, 'This player action is unavailable.');

const errTag = (err) => err.code || err.name || 'unknown';
const trackError = (err) =>
    err.status ? err.message : 'This track could not be played.';

function playbackGain(percent) {
    const masterGain = 0.01; // -40 dB at 100% volume.
    const ratio = percent / 100;
    const sliderGain = ratio < 1 ? ratio ** 1.5 : ratio;
    return sliderGain * masterGain;
}

function publicEntry(entry) {
    if (!entry) return null;
    const { id, title, url, thumbnail, artist, duration, requester, requesterId } = entry;
    return { id, title, url, thumbnail, artist, duration, requester, requesterId };
}

function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}

class PlayerEngine extends EventEmitter {
    constructor({
        provider = media,
        voice,
        settings = (id) => playerSettings.get(id),
        enabled = (id) => settings(id).enabled,
        timeout = aloneMs,
    } = {}) {
        super();
        this.provider = provider;
        this.voiceLibrary = voice;
        this.enabled = enabled;
        this.settings = settings;
        this.timeout = timeout;
        this.sessions = new Map();
        this.jobs = new Set();
        this.lifetime = new AbortController();
    }

    get voice() {
        return (this.voiceLibrary ??= require('@discordjs/voice'));
    }

    log(s, level, message, videoId) {
        const video = videoId ? ` video=${videoId}` : '';
        logger[level](`[Audio Player] ${s.tag}${video} ${message}`);
    }

    guildVolume(id) {
        return this.settings(id).volume ?? playerSettings.defaultVolume;
    }

    snapshot(id) {
        const session = this.sessions.get(id);
        return {
            sessionId: session?.id ?? null,
            state: session?.state ?? 'idle',
            channelId: session?.channelId ?? null,
            current: publicEntry(session?.current),
            queue: session?.queue.map(entry => ({ ...publicEntry(entry), sequence: entry.sequence })) ?? [],
            volume: session?.volume ?? this.guildVolume(id),
            shuffle: session?.shuffle ?? false,
            repeat: session?.repeat ?? false,
            hasPrevious: !!session?.history.length,
            error: session?.error ?? null,
        };
    }

    authorize({ guild, member }) {
        if (!guild || !this.enabled(guild.id))
            throw failure(
                'PLAYER_DISABLED',
                403,
                'The audio player is disabled for this server.',
            );
        const channel = member?.voice?.channel;
        if (
            !member ||
            member.guild?.id !== guild.id ||
            channel?.type !== guildVoiceChannel ||
            channel.guild?.id !== guild.id
        ) {
            throw failure(
                'VOICE_REQUIRED',
                403,
                'Join a regular voice channel in this server to use the player.',
            );
        }
        const bot = guild.members.me;
        const active = this.sessions.get(guild.id);
        if (
            (active && active.channelId !== channel.id) ||
            (bot?.voice?.channelId && bot.voice.channelId !== channel.id)
        ) {
            throw failure(
                'WRONG_CHANNEL',
                403,
                'Join the voice channel where the bot is playing.',
            );
        }
        const permissions = bot && channel.permissionsFor(bot);
        if (!permissions?.has(['ViewChannel', 'Connect', 'Speak'])) {
            throw failure(
                'VOICE_PERMISSIONS',
                403,
                'The bot needs View Channel, Connect, and Speak permissions in this channel.',
            );
        }
        return channel;
    }

    trackJob(promise) {
        const done = () => this.jobs.delete(promise);
        this.jobs.add(promise);
        promise.then(done, done);
        return promise;
    }

    search(query) {
        return this.trackJob(this.provider.search(query, this.lifetime.signal));
    }

    publish(s) {
        if (this.sessions.get(s.guild.id) === s)
            this.emit('update', s.guild.id, this.snapshot(s.guild.id));
    }

    newSession(guild, channel) {
        const id = randomUUID();
        const state = {
            guild,
            id,
            tag: `guild=${guild.id} voice=${channel.id} session=${id}`,
            channelId: channel.id,
            state: 'idle',
            volume: this.guildVolume(guild.id),
            shuffle: false,
            repeat: false,
            current: null,
            queue: [],
            history: [],
            sequence: 0,
            generation: 0,
            pending: 0,
            tail: Promise.resolve(),
            lifetime: new AbortController(),
            audio: new Map(),
            connection: null,
            resource: null,
            stream: null,
            idleTimer: null,
            aloneTimer: null,
            player: this.voice.createAudioPlayer(),
            error: null,
        };
        this.sessions.set(guild.id, state);
        this.log(state, 'debug', 'session created');
        state.player.on('stateChange', (before, after) => {
            this.log(
                state,
                'debug',
                `audio ${before.status} -> ${after.status}`,
                state.current?.id || 'none',
            );
            if (!state.resource) return;
            const { Idle, Playing } = this.voice.AudioPlayerStatus;
            if (before.resource === state.resource && after.status === Idle) {
                this.finish(state, true);
            } else if (
                after.resource === state.resource &&
                after.status === Playing
            ) {
                state.state = 'playing';
                this.publish(state);
            }
        });
        state.player.on('error', (err) => {
            if (err.resource && err.resource === state.resource) {
                this.log(
                    state,
                    'warn',
                    `audio resource failed (${errTag(err)})`,
                    state.current?.id,
                );
                this.fail(state, 'This track could not be played.');
            }
        });
        return state;
    }

    async connect(state) {
        if (state.connection) return;
        const voice = this.voice;
        try {
            this.log(
                state,
                'debug',
                `joining voice, ready deadline=${voiceReadyMs}ms`,
            );
            const connection = voice.joinVoiceChannel({
                channelId: state.channelId,
                guildId: state.guild.id,
                adapterCreator: state.guild.voiceAdapterCreator,
                selfDeaf: true,
            });
            state.connection = connection;
            connection.on('error', (err) => {
                this.log(
                    state,
                    'warn',
                    `voice error (${errTag(err)}) status=${connection.state.status}`,
                );
                if (this.sessions.get(state.guild.id) === state)
                    this.end(state.guild.id, 'voice error');
            });
            connection.on('stateChange', (before, after) => {
                if (before.status !== after.status)
                    this.log(
                        state,
                        'debug',
                        `voice ${before.status} -> ${after.status}`,
                    );
            });
            connection.on(
                voice.VoiceConnectionStatus.Disconnected,
                (_before, after) => {
                    if (this.sessions.get(state.guild.id) === state)
                        this.end(
                            state.guild.id,
                            `voice disconnected (reason=${after?.reason}, close=${after?.closeCode ?? 'none'})`,
                        );
                },
            );
            const signal = AbortSignal.any([
                state.lifetime.signal,
                AbortSignal.timeout(voiceReadyMs),
            ]);
            await voice.entersState(
                connection,
                voice.VoiceConnectionStatus.Ready,
                signal,
            );
            if (state.lifetime.signal.aborted) throw stale();
            connection.subscribe(state.player);
        } catch (err) {
            if (state.lifetime.signal.aborted) throw stale();
            this.log(
                state,
                'warn',
                `voice join failed (${errTag(err)}) status=${state.connection?.state.status ?? 'not created'}`,
            );
            if (this.sessions.get(state.guild.id) === state)
                this.end(state.guild.id, 'voice join failed');
            throw failure(
                'VOICE_UNAVAILABLE',
                503,
                'The bot could not connect to this voice channel.',
            );
        }
    }

    enqueue({ guild, member, query, playlist = false }) {
        const channel = this.authorize({ guild, member });
        if (typeof playlist !== 'boolean')
            throw failure('INVALID_QUERY', 400, 'Invalid playlist request.');

        const s =
            this.sessions.get(guild.id) || this.newSession(guild, channel);
        if (s.pending >= maxPending)
            throw failure(
                'QUEUE_BUSY',
                429,
                'Several requests are pending. Try again shortly.',
            );

        if (s.state === 'idle') clearTimeout(s.idleTimer);
        s.pending++;
        const check = () => {
            if (s.lifetime.signal.aborted) throw stale();
            this.authorize({ guild, member });
        };

        const result = s.tail
            .then(async () => {
                check();
                if (s.queue.length >= maxQueue)
                    throw failure('QUEUE_FULL', 409, 'The queue is full.');
                const found = await this.provider.resolve(
                    query,
                    playlist,
                    s.lifetime.signal,
                    s.tag,
                );
                check();
                if (found.tracks.length) {
                    await this.connect(s);
                    check();
                }
                const room = maxQueue - s.queue.length + (s.current ? 0 : 1);
                const accepted = found.tracks.slice(0, room);
                this.log(
                    s,
                    'debug',
                    `resolved=${found.tracks.length} accepted=${accepted.length} unavailable=${found.unavailable} upcoming=${s.queue.length}`,
                );
                const requester =
                    member.displayName ||
                    member.user?.globalName ||
                    member.user?.username ||
                    'Unknown';
                for (const track of accepted) {
                    const entry = {
                        ...track,
                        requester,
                        requesterId: member.id,
                        sequence: ++s.sequence,
                    };
                    if (s.shuffle)
                        s.queue.splice(
                            Math.floor(Math.random() * (s.queue.length + 1)),
                            0,
                            entry,
                        );
                    else s.queue.push(entry);
                }
                if (!s.current && s.queue.length) this.play(s, s.queue.shift());
                else {
                    this.syncAudio(s);
                    this.publish(s);
                }
                return {
                    added: accepted.length,
                    unavailable: found.unavailable,
                    omitted:
                        found.omitted === null
                            ? null
                            : found.omitted +
                              found.tracks.length -
                              accepted.length,
                };
            })
            .catch((err) => {
                this.log(s, 'debug', `enqueue failed (${errTag(err)})`);
                throw err;
            })
            .finally(() => {
                s.pending--;
                if (!s.pending && !s.current && !s.lifetime.signal.aborted) {
                    if (!s.connection) this.end(guild.id);
                    else this.armIdle(s);
                }
            });
        s.tail = result.catch(() => {});
        return this.trackJob(result);
    }

    refreshIdleTimer(guildId) {
        const session = this.sessions.get(guildId);
        if (session) this.armIdle(session);
    }

    armIdle(s) {
        clearTimeout(s.idleTimer);
        const canIdle =
            s.state === 'paused' || (s.state === 'idle' && !s.pending);
        if (s.lifetime.signal.aborted || !s.connection || !canIdle) return;
        const config = this.settings(s.guild.id);
        if (!config.autoDisconnect) return;
        s.idleTimer = setTimeout(
            () => this.end(s.guild.id, 'idle timeout'),
            config.autoDisconnectSeconds * 1000,
        );
        s.idleTimer.unref();
    }

    discardAudio(s, id) {
        const record = s.audio.get(id);
        if (!record) return;
        s.audio.delete(id);
        record.controller.abort();
        this.trackJob(
            record.asset
                .then(
                    (asset) => asset.cleanup(),
                    () => {},
                )
                .catch((err) => {
                    this.log(
                        s,
                        'warn',
                        `audio cleanup failed (${errTag(err)})`,
                        id,
                    );
                }),
        );
    }

    prepareAudio(s, entry, warm) {
        const existing = s.audio.get(entry.id);
        const context = `${s.tag} video=${entry.id}`;
        if (existing) {
            if (!warm)
                this.log(
                    s,
                    'debug',
                    'reusing prepared or in-progress audio',
                    entry.id,
                );
            return existing.asset;
        }
        this.log(
            s,
            'debug',
            warm ? 'warming next track' : 'preparing audio',
            entry.id,
        );
        const controller = new AbortController();
        const asset = this.provider.prepareStream
            ? this.provider.prepareStream(entry, controller.signal, context)
            : this.provider.prepare(entry, controller.signal, context);
        const record = { controller, asset };
        s.audio.set(entry.id, record);
        asset
            .then((result) => result.ready)
            .catch((err) => {
                if (s.audio.get(entry.id) !== record) return;
                this.discardAudio(s, entry.id);
                if (s.current?.id === entry.id) {
                    this.log(
                        s,
                        'warn',
                        `audio preparation failed (${errTag(err)}); skipping track`,
                        entry.id,
                    );
                    this.fail(s, trackError(err));
                } else {
                    this.log(
                        s,
                        'debug',
                        `cached audio unavailable (${errTag(err)})`,
                        entry.id,
                    );
                }
            });
        return asset;
    }

    syncAudio(s) {
        const next = s.queue[0];
        const keep = new Set([
            s.current?.id,
            next?.id,
            ...s.history.slice(-cachedHistory).map((entry) => entry.id),
        ]);
        for (const id of s.audio.keys()) {
            if (!keep.has(id)) this.discardAudio(s, id);
        }
        if (s.current && next) this.prepareAudio(s, next, true);
    }

    release(s) {
        s.generation++;
        s.resource = null;
        s.player.stop(true);
        s.stream?.destroy();
        s.stream = null;
        s.current = null;
    }

    play(s, entry) {
        clearTimeout(s.idleTimer);
        s.current = entry;
        s.state = 'loading';
        const generation = ++s.generation;
        this.publish(s);
        const loading = this.prepareAudio(s, entry, false)
            .then((asset) => {
                if (generation !== s.generation) return;
                s.stream = asset.openStream
                    ? asset.openStream()
                    : createReadStream(asset.file);
                s.stream.once('error', (err) => {
                    if (generation !== s.generation) return;
                    this.log(
                        s,
                        'warn',
                        `audio file read failed (${errTag(err)})`,
                        entry.id,
                    );
                    this.fail(s, 'This track could not be read.');
                });
                const resource = this.voice.createAudioResource(s.stream, {
                    inputType: this.voice.StreamType.OggOpus,
                    inlineVolume: true,
                });
                s.resource = resource;
                resource.volume.setVolume(playbackGain(s.volume));
                s.player.play(resource);
            })
            .catch((err) => {
                if (generation !== s.generation) return;
                this.log(
                    s,
                    'warn',
                    `playback setup failed (${errTag(err)}); skipping track`,
                    entry.id,
                );
                this.fail(s, trackError(err));
            });
        this.trackJob(loading);
        this.syncAudio(s);
    }

    fail(s, message) {
        s.error = message;
        this.finish(s, false);
    }

    finish(s, successful, skip = false) {
        const old = s.current;
        this.release(s);
        if (!successful && old) this.discardAudio(s, old.id);
        if (successful && s.repeat && !skip) return this.play(s, old);
        if (successful && old) {
            s.history.push(old);
            if (s.history.length > maxHistory) s.history.shift();
        }
        if (s.queue.length) return this.play(s, s.queue.shift());
        s.state = 'idle';
        this.syncAudio(s);
        this.armIdle(s);
        this.publish(s);
    }

    control({ guild, member, action, value, sessionId }) {
        this.authorize({ guild, member });
        const s = this.sessions.get(guild.id);
        if (sessionId != null && s?.id !== sessionId) throw stale();
        if (!s) throw idle();
        switch (action) {
            case 'stop':
                this.end(guild.id, 'stop requested');
                break;
            case 'clear':
                s.queue = [];
                this.syncAudio(s);
                break;
            case 'remove': {
                if (sessionId !== s.id) throw stale();
                if (!Number.isSafeInteger(value) || value < 1) throw invalidAction();
                const index = s.queue.findIndex(entry => entry.sequence === value);
                if (index === -1) throw failure('QUEUE_ENTRY_GONE', 409, 'This track is no longer in the queue.');
                s.queue.splice(index, 1);
                this.syncAudio(s);
                break;
            }
            case 'skip':
                if (!s.current) throw idle();
                this.finish(s, true, true);
                break;
            case 'previous': {
                if (!s.history.length) throw invalidAction();
                const previous = s.history.pop();
                if (s.current) {
                    // A full upcoming queue still has to respect its cap when navigating backward.
                    if (s.queue.length >= maxQueue) {
                        s.history.push(previous);
                        throw failure(
                            'QUEUE_FULL',
                            409,
                            'Make room in the queue before going back.',
                        );
                    }
                    s.queue.unshift(s.current);
                }
                this.release(s);
                this.play(s, previous);
                break;
            }
            case 'pause':
                if (s.state !== 'playing' || !s.player.pause())
                    throw invalidAction();
                s.state = 'paused';
                this.armIdle(s);
                break;
            case 'resume':
                if (s.state !== 'paused' || !s.player.unpause())
                    throw invalidAction();
                s.state = 'playing';
                clearTimeout(s.idleTimer);
                break;
            case 'volume':
                if (!playerSettings.validVolume(value)) throw invalidAction();
                if (s.volume !== value)
                    playerSettings.set(guild.id, { volume: value });
                s.volume = value;
                s.resource?.volume.setVolume(playbackGain(value));
                break;
            case 'repeat':
            case 'shuffle': {
                if (value !== undefined && typeof value !== 'boolean')
                    throw invalidAction();
                const on = value ?? !s[action];
                if (action === 'shuffle' && on !== s.shuffle) {
                    if (on) shuffleInPlace(s.queue);
                    else s.queue.sort((a, b) => a.sequence - b.sequence);
                    this.syncAudio(s);
                }
                s[action] = on;
                break;
            }
            default:
                throw invalidAction();
        }
        this.publish(s);
        return this.snapshot(guild.id);
    }

    end(id, reason = 'session closed') {
        const s = this.sessions.get(id);
        if (!s) return;
        this.log(
            s,
            'debug',
            `ending: ${reason}; state=${s.state} upcoming=${s.queue.length}`,
        );
        this.sessions.delete(id);
        s.lifetime.abort();
        clearTimeout(s.idleTimer);
        clearTimeout(s.aloneTimer);
        this.release(s);
        for (const videoId of s.audio.keys()) this.discardAudio(s, videoId);
        if (
            s.connection &&
            s.connection.state.status !==
                this.voice.VoiceConnectionStatus.Destroyed
        )
            s.connection.destroy();
        this.emit('update', id, this.snapshot(id));
    }

    voiceUpdate(oldState, newState) {
        const guild = newState.guild;
        const s = this.sessions.get(guild.id);
        if (!s) return;
        if (
            newState.id === guild.members.me?.id &&
            newState.channelId !== s.channelId &&
            oldState.channelId === s.channelId
        ) {
            this.end(guild.id, 'bot moved or removed from voice');
            return;
        }
        if (
            oldState.channelId !== s.channelId &&
            newState.channelId !== s.channelId
        )
            return;
        const channel = guild.channels.cache.get(s.channelId);
        if (!channel) {
            this.end(guild.id, 'voice channel unavailable');
            return;
        }
        if (channel.members.some((member) => !member.user.bot)) {
            clearTimeout(s.aloneTimer);
            s.aloneTimer = null;
        } else if (!s.aloneTimer) {
            s.aloneTimer = setTimeout(
                () => this.end(guild.id, 'empty voice channel timeout'),
                this.timeout,
            );
            s.aloneTimer.unref();
        }
    }

    async shutdown() {
        this.lifetime.abort();
        for (const id of this.sessions.keys()) this.end(id, 'shutdown');
        await Promise.allSettled(this.jobs);
    }
}

module.exports = new PlayerEngine();
module.exports.PlayerEngine = PlayerEngine;
