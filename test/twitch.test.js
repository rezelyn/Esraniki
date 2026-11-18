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
