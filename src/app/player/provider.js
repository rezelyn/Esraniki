const childProcess = require('node:child_process');
const fs = require('node:fs');
const { promises: files } = fs;
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { finished } = require('node:stream/promises');
const { setTimeout: delay } = require('node:timers/promises');

const logger = require('../../utils/logger');

const youtubeHosts = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtu.be',
]);
const youtubeWatchUrl = 'https://www.youtube.com/watch?v=';
const youtubePlaylistUrl = 'https://www.youtube.com/playlist?list=';
const soundcloudHosts = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);
const shareHosts = new Set(['on.soundcloud.com', 'soundcloud.app.goo.gl']);
const soundcloudSlug = /^[\w-]+$/;
const siteSections = new Set(['discover', 'search', 'you', 'stations', 'stream', 'charts', 'upload', 'pages', 'settings']);
const profileSections = new Set(['tracks', 'sets', 'albums', 'likes', 'reposts', 'popular-tracks', 'followers', 'following', 'comments']);

const videoId = /^[A-Za-z0-9_-]{11}$/;
const playlistId = /^[A-Za-z0-9_-]{2,150}$/;
const byteLimit = 128 * 1024 * 1024;
const maxImport = 50;

const cookiePath = path.resolve(__dirname, '../../../cookies.txt');

function failure(code, status, message) {
    return Object.assign(new Error(message), {
        code,
        status,
        statusCode: status,
    });
}

function invalid() {
    return failure(
        'INVALID_QUERY',
        400,
        'Enter search terms or a public YouTube or SoundCloud track or playlist link.',
    );
}

function parseQuery(input, source = 'youtube') {
    if (source !== 'youtube' && source !== 'soundcloud') throw invalid();
    if (typeof input !== 'string') throw invalid();
    const query = input.trim();
    if (!query || query.length > 500 || /[\x00-\x1f\x7f]/.test(query))
        throw invalid();
    if (!/^[a-z][a-z\d+.-]*:/i.test(query) && !query.startsWith('//')) {
        if (
            /^[\w.-]+\.[a-z]{2,}\//i.test(query)
        ) {
            return parseQuery('https://' + query, source);
        }
        return { kind: 'search', query, source };
    }
    let url;
    try {
        url = new URL(query);
    } catch {
        throw invalid();
    }
    if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.port ||
        url.username ||
        url.password
    )
        throw invalid();
    const parts = url.pathname.split('/').filter(Boolean);
    if (shareHosts.has(url.hostname) && parts.length === 1 && soundcloudSlug.test(parts[0]))
        return { kind: 'share', source: 'soundcloud', url: 'https://' + url.hostname + '/' + parts[0] };
    if (soundcloudHosts.has(url.hostname)) {
        if (!parts.every(part => soundcloudSlug.test(part)) || siteSections.has(parts[0])) throw invalid();
        const permalink = 'https://soundcloud.com/' + parts.join('/');
        if (parts.length === 3 && parts[1] === 'sets')
            return { kind: 'playlist', source: 'soundcloud', url: permalink };
        if (parts.length === 2 && !profileSections.has(parts[1]))
            return { kind: 'track', source: 'soundcloud', url: permalink };
        throw invalid();
    }
    if (!youtubeHosts.has(url.hostname)) throw invalid();
    const short = url.hostname.endsWith('youtu.be');
    const id = short
        ? parts[0]
        : parts[0] === 'watch'
          ? url.searchParams.get('v')
          : ['shorts', 'live', 'embed'].includes(parts[0])
            ? parts[1]
            : null;
    const list = url.searchParams.get('list');
    if (
        list &&
        playlistId.test(list) &&
        !short && parts[0] === 'playlist'
    ) {
        return { kind: 'playlist', source: 'youtube', url: youtubePlaylistUrl + list };
    }
    if (!id || !videoId.test(id)) throw invalid();
    return { kind: 'track', source: 'youtube', url: youtubeWatchUrl + id };
}

async function resolveTarget(input, source, signal) {
    let target = parseQuery(input, source);
    if (target.kind !== 'share') return target;
    const deadline = AbortSignal.timeout(10000);
    const timeout = signal ? AbortSignal.any([signal, deadline]) : deadline;
    for (let hop = 0; hop < 5; hop++) {
        const response = await fetch(target.url, { method: 'HEAD', redirect: 'manual', signal: timeout })
            .catch(() => { throw unavailable(); });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) throw unavailable();
        if (!URL.canParse(location, target.url)) throw invalid();
        target = parseQuery(new URL(location, target.url).href);
        if (target.source !== 'soundcloud') throw invalid();
        if (target.kind !== 'share') return target;
    }
    throw unavailable();
}

function publicTrack(entry, source = 'youtube') {
    if (
        !entry ||
        !(source === 'youtube' ? videoId : /^\d+$/).test(entry.id) ||
        !entry.title ||
        !Number.isFinite(entry.duration) ||
        entry.duration <= 0
    )
        return null;
    if (
        entry.is_live ||
        entry.is_upcoming ||
        ['is_live', 'is_upcoming', 'post_live'].includes(entry.live_status)
    )
        return null;
    if (
        ['private', 'premium_only', 'subscriber_only', 'needs_auth'].includes(
            entry.availability,
        )
    )
        return null;
    let url = youtubeWatchUrl + entry.id;
    let thumbnail = 'https://i.ytimg.com/vi/' + entry.id + '/hqdefault.jpg';
    if (source === 'soundcloud') {
        try {
            const link = parseQuery(entry.webpage_url || entry.permalink_url || entry.url);
            if (link.source !== source || link.kind !== 'track') return null;
            url = link.url;
        } catch { return null; }
        thumbnail = /^https:\/\/[ai]1\.sndcdn\.com\//i.test(entry.thumbnail) ? entry.thumbnail : null;
    }
    return {
        id: String(entry.id),
        source,
        title: String(entry.title).slice(0, 350),
        url,
        thumbnail,
        artist: String(entry.artist || entry.channel || entry.uploader || '')
            .trim()
            .slice(0, 256),
        duration: entry.duration,
        requester: null,
    };
}

async function options(dir, source) {
    const args = [
        '--ignore-config',
        '--no-cache-dir',
        '--no-warnings',
        '--no-progress',
        '--socket-timeout',
        '15',
        '--retries',
        '1',
        '--js-runtimes',
        'node',
    ];
    if (source === 'soundcloud') return args;
    if (process.env.COOKIES_FROM_BROWSER)
        args.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
    else if (process.env.COOKIES_FILE || fs.existsSync(cookiePath)) {
        const jar = path.join(dir, 'cookies.txt');
        await files.copyFile(process.env.COOKIES_FILE || cookiePath, jar);
        await files.chmod(jar, 0o600);
        args.push('--cookies', jar);
    }
    if (process.env.YTDL_PLAYER_CLIENTS)
        args.push(
            '--extractor-args',
            'youtube:player_client=' + process.env.YTDL_PLAYER_CLIENTS,
        );
    return args;
}

function unavailable() {
    return failure(
        'UNAVAILABLE',
        422,
        'This media could not be loaded. It may be unavailable or restricted.',
    );
}

function mediaFailureReason(stderr) {
    const http = stderr.match(
        /HTTP (?:Error |error |status (?:code )?)?(\d{3})\b/i,
    );
    if (http) return 'HTTP ' + http[1];
    const reasons = [
        [
            /sign in to confirm|not a bot|sign in to verify/i,
            'YouTube requires sign-in',
        ],
        [
            /private video|video unavailable|not available in your country|age.restricted/i,
            'video access restricted',
        ],
        [/requested format is not available/i, 'requested format unavailable'],
        [/cookie/i, 'cookie access or authentication failed'],
        [
            /javascript runtime|challenge solv|signature extraction/i,
            'YouTube JavaScript challenge failed',
        ],
        [/timed? out/i, 'network timeout'],
        [
            /unable to resolve|name resolution|getaddrinfo/i,
            'DNS resolution failed',
        ],
        [
            /certificate verify|certificate verification/i,
            'TLS verification failed',
        ],
        [/unknown encoder|encoder .*not found/i, 'encoder unavailable'],
        [/invalid data found|error while decoding/i, 'invalid audio stream'],
        [/no space left/i, 'out of disk space'],
    ];
    return (
        reasons.find(([pattern]) => pattern.test(stderr))?.[1] ||
        'unclassified tool failure'
    );
}

function run(stage, binary, args, signal, timeout, capture = false, allowPartial = false) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted)
            return reject(
                failure('STALE_SESSION', 409, 'Playback was cancelled.'),
            );
        const started = Date.now();
        logger.debug(`[Audio Player] ${stage} started`);
        const child = childProcess.spawn(binary, args, {
            windowsHide: true,
            stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'],
        });
        let termination;
        let reason;
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            stderr = (stderr + chunk).slice(-4096);
        });
        let length = 0;
        const chunks = [];
        function terminate(error, detail) {
            if (termination) return;
            termination = error;
            reason = detail;
            child.kill('SIGKILL');
        }
        const cancel = () =>
            terminate(
                failure('STALE_SESSION', 409, 'Playback was cancelled.'),
                'cancelled',
            );
        const timer = setTimeout(
            () => terminate(unavailable(), 'process deadline exceeded'),
            timeout,
        );
        timer.unref();
        signal?.addEventListener('abort', cancel, { once: true });
        child.stdout?.on('data', (chunk) => {
            length += chunk.length;
            if (length > 8 * 1024 * 1024)
                terminate(unavailable(), 'metadata output exceeded 8 MiB');
            else chunks.push(chunk);
        });
        child.once('error', (err) => {
            termination = failure(
                'VOICE_UNAVAILABLE',
                503,
                'The audio tools are unavailable.',
            );
            reason = 'process error ' + (err.code || err.name);
        });
        child.once('close', (code, exitSignal) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            const elapsed = Date.now() - started;
            // yt-dlp can emit a valid playlist and exit 1 when individual items fail.
            if (termination || (code !== 0 && !(allowPartial && code === 1 && length > 0))) {
                const diagnostic = reason || mediaFailureReason(stderr);
                logger.debug(
                    `[Audio Player] ${stage} ended after ${elapsed}ms: ${diagnostic} (exit=${code}, signal=${exitSignal || 'none'})`,
                );
                const error = termination || unavailable();
                error.diagnostic = diagnostic;
                reject(error);
            } else {
                logger.debug(`[Audio Player] ${stage} completed in ${elapsed}ms`);
                resolve(
                    capture
                        ? Buffer.concat(chunks).toString('utf8')
                        : undefined,
                );
            }
        });
    });
}

function ytDlp() {
    return (
        process.env.YTDLP_PATH ||
        require('youtube-dl-exec/src/constants').YOUTUBE_DL_PATH
    );
}

let metadataJobs = 0;
const tempPrefix = 'esraniki-player-';
const removeDir = (dir) =>
    files.rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
    });

async function metadata(target, args, signal, context, source, timeout = 30000) {
    if (metadataJobs >= 8) {
        logger.debug(
            `[Audio Player] ${context} metadata rejected: all 8 slots occupied`,
        );
        throw failure(
            'MEDIA_BUSY',
            429,
            'The player is busy. Try again shortly.',
        );
    }
    metadataJobs++;
    let dir;
    try {
        dir = await files.mkdtemp(path.join(os.tmpdir(), tempPrefix));
        const json = await run(
            context + ' yt-dlp metadata',
            ytDlp(),
            [
                ...(await options(dir, source)),
                '--dump-single-json',
                ...args,
                '--',
                target,
            ],
            signal,
            timeout,
            true,
            args.includes('--ignore-errors'),
        );
        try {
            const info = JSON.parse(json);
            if (!info || typeof info !== 'object') throw unavailable();
            return info;
        } catch {
            logger.debug(`[Audio Player] ${context} yt-dlp returned invalid JSON`);
            throw unavailable();
        }
    } catch (error) {
        if (!error.status)
            logger.debug(
                `[Audio Player] ${context} metadata setup failed: ${error.syscall || 'setup'} ${error.code || error.name}`,
            );
        throw error.status
            ? error
            : failure(
                  'VOICE_UNAVAILABLE',
                  503,
                  'The audio tools are unavailable.',
              );
    } finally {
        metadataJobs--;
        if (dir) await removeDir(dir).catch(() => {});
    }
}

async function searchTarget(target, signal, context) {
    if (target.kind === 'playlist') throw invalid();
    if (target.kind === 'track') {
        const track = publicTrack(
            await metadata(target.url, ['--no-playlist'], signal, context, target.source), target.source,
        );
        return track ? [track] : [];
    }
    const info = await metadata(
        (target.source === 'soundcloud' ? 'scsearch5:' : 'ytsearch5:') + target.query,
        target.source === 'soundcloud' ? ['--ignore-errors', '--no-flat-playlist'] : ['--flat-playlist'],
        signal,
        context,
        target.source,
    );
    return (info.entries || []).map(entry => publicTrack(entry, target.source)).filter(Boolean).slice(0, 5);
}

async function search(query, signal, source = 'youtube') {
    return searchTarget(await resolveTarget(query, source, signal), signal, 'search');
}

async function resolve(query, source, signal, context = 'enqueue') {
    const target = await resolveTarget(query, source, signal);
    if (target.kind !== 'playlist') {
        const results = await searchTarget(target, signal, context);
        if (!results.length) {
            logger.debug(
                `[Audio Player] ${context} metadata contained no playable finite videos`,
            );
            throw unavailable();
        }
        return { tracks: results.slice(0, 1), unavailable: 0, omitted: 0 };
    }
    const info = await metadata(
        target.url,
        [
            target.source === 'soundcloud' ? '--no-flat-playlist' : '--flat-playlist',
            '--yes-playlist',
            '--ignore-errors',
            '--playlist-end',
            String(maxImport + 1),
        ],
        signal,
        context,
        target.source,
        target.source === 'soundcloud' ? 180000 : 30000,
    );
    const entries = info.entries || [];
    const inspected = entries.slice(0, maxImport);
    const tracks = inspected.map(entry => publicTrack(entry, target.source)).filter(Boolean);
    const total = info.playlist_count;
    const omitted = Number.isInteger(total)
        ? Math.max(0, total - maxImport)
        : entries.length > maxImport
          ? null
          : 0;
    return { tracks, unavailable: inspected.length - tracks.length, omitted };
}

let downloadJobs = 0;
const waiting = [];
let checkFormatsUntil = 0;

async function acquireDownload(signal) {
    if (signal.aborted)
        throw failure('STALE_SESSION', 409, 'Playback was cancelled.');
    if (downloadJobs < 4) {
        downloadJobs++;
        return;
    }
    await new Promise((resolve, reject) => {
        const resume = () => {
            signal.removeEventListener('abort', cancel);
            resolve();
        };
        const cancel = () => {
            waiting.splice(waiting.indexOf(resume), 1);
            reject(failure('STALE_SESSION', 409, 'Playback was cancelled.'));
        };
        waiting.push(resume);
        signal.addEventListener('abort', cancel, { once: true });
    });
}

function releaseDownload() {
    if (waiting.length) waiting.shift()();
    else downloadJobs--;
}

async function* readEncoding(file, state, signal) {
    const handle = await files.open(file, 'r');
    try {
        for (;;) {
            signal.throwIfAborted();
            if (state.error) throw state.error;
            const done = state.done;
            const buffer = Buffer.allocUnsafe(64 * 1024);
            const { bytesRead } = await handle.read(buffer);
            if (bytesRead) yield buffer.subarray(0, bytesRead);
            else if (done) return;
            else await delay(50, undefined, { signal });
        }
    } finally {
        await handle.close();
    }
}

async function prepareStream(
    track,
    signal,
    context = 'video=' + track.id,
) {
    if (downloadJobs >= 4)
        logger.debug(
            `[Audio Player] ${context} waiting for a download slot; ahead=${waiting.length}`,
        );
    await acquireDownload(signal);
    let dir;
    try {
        dir = await files.mkdtemp(path.join(os.tmpdir(), tempPrefix));
        const source = path.join(dir, 'source');
        const file = path.join(dir, 'track.ogg');
        const downloadArgs = [
            ...(await options(dir, track.source)),
            '--no-playlist',
            '--downloader',
            'native',
            '--no-part',
            '--fixup',
            'never',
            '--match-filter',
            'duration>0 & !is_live',
            '--max-filesize',
            String(byteLimit),
            '-f',
            track.source === 'soundcloud' ? 'bestaudio/best' : 'bestaudio[protocol=https]/best[protocol=https]',
            '-o',
            source,
            '--',
            track.url,
        ];
        const checkFormats = track.source !== 'soundcloud' && Date.now() < checkFormatsUntil;
        try {
            if (checkFormats)
                logger.debug(
                    `[Audio Player] ${context} using format checks after a recent HTTP 403`,
                );
            await run(
                context + ' yt-dlp download',
                ytDlp(),
                checkFormats
                    ? ['--check-formats', ...downloadArgs]
                    : downloadArgs,
                signal,
                120000,
            );
        } catch (err) {
            if (track.source === 'soundcloud' || checkFormats || err.diagnostic !== 'HTTP 403' || signal.aborted)
                throw err;
            await files.rm(source, { force: true });
            logger.debug(
                `[Audio Player] ${context} retrying HTTP 403 once with downloadable format checks`,
            );
            await run(
                context + ' yt-dlp format retry',
                ytDlp(),
                ['--check-formats', ...downloadArgs],
                signal,
                120000,
            );
            checkFormatsUntil = Date.now() + 15 * 60 * 1000;
        }
        await files.rm(path.join(dir, 'cookies.txt'), { force: true });
        const downloaded = await files.stat(source);
        if (downloaded.size <= 0 || downloaded.size > byteLimit) {
            logger.debug(
                `[Audio Player] ${context} download size rejected: ${downloaded.size} bytes`,
            );
            throw unavailable();
        }
        const ffmpeg = process.env.FFMPEG_PATH || require('ffmpeg-static');
        await files.writeFile(file, '', { flag: 'wx' });
        const controller = new AbortController();
        const encodingSignal = AbortSignal.any([signal, controller.signal]);
        const state = { done: false, error: null };
        const readers = new Map();
        function openStream() {
            encodingSignal.throwIfAborted();
            const stream = Readable.from(
                readEncoding(file, state, encodingSignal),
                { objectMode: false },
            );
            const closed = finished(stream, { cleanup: true })
                .catch(() => {})
                .finally(() => readers.delete(stream));
            readers.set(stream, closed);
            return stream;
        }
        const ready = run(
            context + ' FFmpeg encode',
            ffmpeg,
            [
                '-nostdin',
                '-y',
                '-loglevel',
                'error',
                '-protocol_whitelist',
                'file,pipe',
                '-i',
                source,
                '-vn',
                '-c:a',
                'libopus',
                '-b:a',
                '96k',
                '-ar',
                '48000',
                '-ac',
                '2',
                '-page_duration',
                '100000',
                '-flush_packets',
                '1',
                '-fs',
                String(byteLimit),
                '-f',
                'ogg',
                file,
            ],
            encodingSignal,
            120000,
        )
            .then(async () => {
                const output = await files.stat(file);
                if (!output.size || output.size >= byteLimit) {
                    logger.debug(
                        `[Audio Player] ${context} encoded size rejected: ${output.size} bytes`,
                    );
                    throw unavailable();
                }
                await files.unlink(source);
                state.done = true;
            })
            .catch((err) => {
                state.error = err.status ? err : unavailable();
                for (const stream of readers.keys())
                    stream.destroy(state.error);
                throw state.error;
            })
            .finally(releaseDownload);
        ready.catch(() => {});
        let removal;
        function cleanup() {
            if (!removal) {
                controller.abort();
                for (const stream of readers.keys()) stream.destroy();
                removal = Promise.allSettled([ready, ...readers.values()]).then(
                    () => removeDir(dir),
                );
            }
            return removal;
        }
        return {
            file,
            openStream,
            ready,
            cleanup,
        };
    } catch (err) {
        releaseDownload();
        if (!err.status)
            logger.debug(
                `[Audio Player] ${context} audio preparation failed: ${err.syscall || 'setup'} ${err.code || err.name}`,
            );
        if (dir) await removeDir(dir).catch(() => {});
        throw err.status ? err : unavailable();
    }
}

async function prepare(track, signal, context) {
    const asset = await prepareStream(track, signal, context);
    try {
        await asset.ready;
        return asset;
    } catch (err) {
        await asset.cleanup();
        throw err;
    }
}

module.exports = {
    parseQuery,
    publicTrack,
    search,
    resolve,
    prepareStream,
    prepare,
    failure,
};
