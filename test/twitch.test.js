const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');

function setup(entries = [{ twitchChannel: 'streamer', discordChannelId: 'channel' }]) {
    const source = fs.readFileSync(path.join(__dirname, '../src/dashboard/server.js'), 'utf8');
    const errors = [], sent = [], successes = [];
    let streams = [{ id: 'stream-1', user_login: 'streamer', title: 'Title', game_name: 'Game' }];
    const context = vm.createContext({
        path, __dirname, URLSearchParams, Buffer, URL, Date, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {},
        process: { env: { TWITCH_CLIENT_ID: 'test', TWITCH_CLIENT_SECRET: 'test' } },
        fs: { promises: { access: async () => {}, readdir: async () => [
            { name: 'guild', isDirectory: () => true }
        ] } },
        https: {},
        handleError: (error) => errors.push(error),
        logger: { success: (message) => successes.push(message), debug() {} }
    });
    vm.runInContext(source.slice(source.indexOf('const TWITCH_POLL_INTERVAL_MS'), source.indexOf('const sessions =')), context);
    vm.runInContext(source.slice(source.indexOf('const twitchLive ='), source.indexOf('let botAvatarURL')), context);
    vm.runInContext(source.slice(source.indexOf('function twitchFile('), source.indexOf('function shrimpFile(')), context);
    context.loadTwitch = async () => ({ entries });
    const fetchStreams = context.fetchTwitchStreams;
    context.fetchTwitchStreams = async () => streams;
    const destination = {
        guildId: 'guild', isSendable: () => true, isThread: () => false,
        permissionsFor: () => ({ has: () => true }),
        send: async (message) => { sent.push(message); }
    };
    const client = { channels: { fetch: async () => destination } };
    return { context, errors, sent, successes, destination, client, fetchStreams,
        poll: () => context.pollTwitch(client), setStreams(value) { streams = value; } };
}

test('polling contains directory errors and malformed guild configuration', async () => {
    const directory = setup();
    directory.context.fs.promises.readdir = async () => { throw new Error('EACCES'); };
    await directory.poll();
    assert.equal(directory.errors.length, 1);
    const malformed = setup([null]);
    await malformed.poll();
    assert.equal(malformed.errors.length, 1);
    malformed.context.loadTwitch = async () => ({ entries: [] });
    await malformed.poll();
    assert.equal(malformed.errors.length, 1);
});

test('live, offline, live transitions announce each broadcast once', async () => {
    const state = setup();
    await state.poll();
    await state.poll();
    assert.equal(state.sent.length, 1);
    state.setStreams([]);
    await state.poll();
    state.setStreams([{ id: 'stream-2', user_login: 'streamer' }]);
    await state.poll();
    assert.equal(state.sent.length, 2);
});

test('failed sends are logged, retried, and do not block other streamers', async () => {
    const state = setup([
        { twitchChannel: 'streamer', discordChannelId: 'broken' },
        { twitchChannel: 'other', discordChannelId: 'working' }
    ]);
    state.setStreams([{ user_login: 'streamer' }, { user_login: 'other' }]);
    state.client.channels.fetch = async id => id === 'broken'
        ? { ...state.destination, send: async () => { throw new Error('Missing Permissions'); } }
        : state.destination;
    await state.poll();
    assert.equal(state.errors.length, 1);
    assert.equal(state.successes.length, 1);
    assert.equal(state.sent.length, 1);
    state.client.channels.fetch = async () => state.destination;
    await state.poll();
    assert.equal(state.sent.length, 2);
    assert.equal(state.successes.length, 2);
});

test('a missing Discord channel is retried on the next poll', async () => {
    const state = setup();
    state.client.channels.fetch = async () => null;
    await state.poll();
    assert.equal(state.successes.length, 0);
    state.client.channels.fetch = async () => state.destination;
    await state.poll();
    assert.equal(state.sent.length, 1);
});

test('overlapping polls cannot send duplicate announcements', async () => {
    const state = setup();
    await Promise.all([state.poll(), state.poll()]);
    assert.equal(state.sent.length, 1);
});

function mockHttp(context, respond) {
    context.https.request = (options, callback) => {
        const request = new EventEmitter();
        request.destroy = error => request.emit('error', error);
        request.end = body => queueMicrotask(() => {
            const response = new EventEmitter();
            response.setEncoding = () => {};
            response.statusCode = 200;
            response.headers = {};
            callback(response);
            respond(response, options, body);
        });
        return request;
    };
}

test('aborted responses, response errors, and premature closes reject requests', async () => {
    for (const event of ['aborted', 'error', 'close']) {
        const state = setup();
        mockHttp(state.context, response => response.emit(event, new Error('broken response')));
        await assert.rejects(state.context.requestTwitch({}), /Twitch response|broken response/);
    }
});

test('stalled requests hit a deadline and release the polling lock', async () => {
    const state = setup();
    let timeout;
    state.context.setTimeout = callback => { timeout = callback; return 1; };
    state.context.clearTimeout = () => {};
    mockHttp(state.context, () => {});
    state.context.fetchTwitchStreams = () => state.context.requestTwitch({});
    const polling = state.poll();
    await new Promise(resolve => setImmediate(resolve));
    timeout();
    await polling;
    assert.match(state.errors[0].message, /timed out/);
    state.context.fetchTwitchStreams = async () => [{ user_login: 'streamer' }];
    await state.poll();
    assert.equal(state.sent.length, 1);
});

test('HTTP failures and invalid JSON reject instead of indicating offline streams', async () => {
    for (const status of [401, 429, 500]) {
        const state = setup();
        mockHttp(state.context, response => {
            response.statusCode = status;
            response.emit('data', '{"error":"API failure"}');
            response.emit('end');
        });
        await assert.rejects(state.context.requestTwitch({ path: '/helix/streams' }), error => error.status === status);
        if (status === 429) await assert.rejects(state.context.requestTwitch({}), /backoff/);
    }
    const invalid = setup();
    mockHttp(invalid.context, response => { response.emit('data', '<html>'); response.emit('end'); });
    await assert.rejects(invalid.context.requestTwitch({}), /Unexpected token/);
});

test('unauthorized requests renew the token once and retry, with bounded failures', async () => {
    const state = setup();
    let tokens = 0, calls = 0;
    state.context.fetchTwitchAppToken = async () => ({ access_token: String(++tokens), expires_at: Date.now() + 60000 });
    state.context.requestTwitch = async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error('Unauthorized'), { status: 401 });
        return { data: [{ user_login: 'streamer' }] };
    };
    assert.equal((await state.fetchStreams(['streamer'])).length, 1);
    assert.equal(tokens, 2);
    assert.equal(calls, 2);
    state.context.requestTwitch = async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); };
    await assert.rejects(state.fetchStreams(['streamer']), /Unauthorized/);
    assert.equal(tokens, 3);
});

test('concurrent token requests share renewal and malformed data preserves live state', async () => {
    const state = setup();
    let tokens = 0;
    state.context.fetchTwitchAppToken = async () => ({ access_token: String(++tokens), expires_at: Date.now() + 60000 });
    await Promise.all([state.context.getTwitchToken(), state.context.getTwitchToken()]);
    assert.equal(tokens, 1);
    await state.poll();
    state.context.fetchTwitchStreams = state.fetchStreams;
    state.context.requestTwitch = async () => ({ error: 'bad data' });
    await state.poll();
    assert.equal(state.errors.length, 1);
    state.context.requestTwitch = async () => ({ data: [{ user_login: 'streamer' }] });
    await state.poll();
    assert.equal(state.sent.length, 1);
});

test('the same streamer announces independently to each destination', async () => {
    const state = setup([
        { twitchChannel: 'streamer', discordChannelId: 'a' },
        { twitchChannel: 'streamer', discordChannelId: 'b' }
    ]);
    let fail = true;
    const destinations = [];
    state.client.channels.fetch = async id => ({ ...state.destination, send: async () => {
        if (id === 'a' && fail) throw new Error('Missing Permissions');
        destinations.push(id);
    } });
    await state.poll();
    assert.deepEqual(destinations, ['b']);
    fail = false;
    await state.poll();
    await state.poll();
    assert.deepEqual(destinations, ['b', 'a']);
});

test('configuration rejects malformed entries and enforces template limits', () => {
    const { context } = setup();
    const valid = { twitchChannel: ' Streamer ', discordChannelId: '123456789012345678', message: '{title}' };
    const entries = context.normalizeTwitchEntries({ entries: [valid, {}] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].twitchChannel, 'streamer');
    for (const config of [null, { entries: {} }, { entries: [null] },
        { entries: [{ ...valid, twitchChannel: 42 }] },
        { entries: [{ ...valid, twitchChannel: 'https://twitch.tv/streamer' }] },
        { entries: [{ ...valid, discordChannelId: '' }] },
        { entries: [{ ...valid, message: 'x'.repeat(501) }] }]) {
        assert.throws(() => context.normalizeTwitchEntries(config));
    }
});

test('destinations must belong to the guild and permit sending', async () => {
    const state = setup();
    for (const change of [{ guildId: 'other' }, { isSendable: () => false },
        { permissionsFor: () => ({ has: () => false }) }]) {
        state.client.channels.fetch = async () => ({ ...state.destination, ...change });
        await assert.rejects(state.context.getTwitchDestination(state.client, 'guild', 'channel'));
        await state.poll();
        assert.equal(state.sent.length, 0);
    }
});

test('expanded messages fit Discord limits, retain their URL, and substitute literally', () => {
    const { context } = setup();
    const literal = context.formatTwitchAnnouncement({ twitchChannel: 'streamer', message: '{title} {url}' }, { title: '$& {game}' });
    assert.equal(literal, '$& {game} https://twitch.tv/streamer');
    for (const message of ['{title}'.repeat(60), '{title}'.repeat(60) + '{url}']) {
        const content = context.formatTwitchAnnouncement({ twitchChannel: 'streamer', message }, { title: 'x'.repeat(140) });
        assert.ok(content.length <= 2000);
        assert.ok(content.endsWith('https://twitch.tv/streamer'));
    }
});

test('streams and avatars deduplicate logins and request batches of at most 100', async () => {
    for (const endpoint of ['streams', 'users']) {
        const state = setup();
        const sizes = [];
        state.context.fetchTwitchAppToken = async () => ({ access_token: 'token', expires_at: Date.now() + 60000 });
        state.context.requestTwitch = async options => {
            const query = new URL('https://api.twitch.tv' + options.path).searchParams;
            const logins = query.getAll(endpoint === 'streams' ? 'user_login' : 'login');
            sizes.push(logins.length);
            return { data: logins.map(login => endpoint === 'streams' ? { user_login: login } : { login }) };
        };
        const fetchData = endpoint === 'streams' ? state.fetchStreams : state.context.fetchTwitchUsers;
        const result = await fetchData([...Array.from({ length: 205 }, (_, i) => 'user' + i), ' USER0 ', '']);
        assert.equal(result.length, 205);
        assert.deepEqual(sizes, [100, 100, 5]);
        assert.equal((await fetchData([])).length, 0);
        assert.equal(sizes.length, 3);
    }
});

test('a failed later batch does not return partial live-stream data', async () => {
    const state = setup();
    let calls = 0;
    state.context.fetchTwitchAppToken = async () => ({ access_token: 'token', expires_at: Date.now() + 60000 });
    state.context.requestTwitch = async () => {
        if (++calls === 2) throw new Error('Twitch unavailable');
        return { data: [{ user_login: 'user0' }] };
    };
    await assert.rejects(state.fetchStreams(Array.from({ length: 101 }, (_, i) => 'user' + i)), /unavailable/);
});
