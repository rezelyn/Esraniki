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
    const destination = { guildId: 'guild', isSendable: () => true, send: async (message) => { sent.push(message); } };
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
        ? { send: async () => { throw new Error('Missing Permissions'); } }
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
