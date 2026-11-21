const store = require('../../utils/settings');
const defaultVolume = 100;

const maxIdleSeconds = Math.floor(0x7fffffff / 1000);
function validIdleSeconds(value) {
    return Number.isInteger(value) && value >= 1 && value <= maxIdleSeconds;
}

function validVolume(value) {
    return Number.isInteger(value) && value >= 0 && value <= 200;
}

function get(guildId) {
    const settings = store.get('player', {}, guildId);
    return {
        enabled: settings.enabled !== false,
        volume: validVolume(settings.volume) ? settings.volume : defaultVolume,
        announcementChannelId: settings.announcementChannelId || null,
        readOnlyChannel: settings.readOnlyChannel !== false,
        autoDisconnect: settings.autoDisconnect !== false,
        autoDisconnectSeconds: validIdleSeconds(settings.autoDisconnectSeconds)
            ? settings.autoDisconnectSeconds
            : 60,
    };
}

function set(guildId, patch) {
    if (!/^\d+$/.test(guildId) || !patch || typeof patch !== 'object') {
        throw new TypeError('Invalid guild player settings');
    }
    const next = get(guildId);
    if ('volume' in patch) {
        if (!validVolume(patch.volume))
            throw Object.assign(
                new Error('Enter a whole volume percentage from 0 to 200.'),
                { status: 400 },
            );
        next.volume = patch.volume;
    }
    if ('readOnlyChannel' in patch) {
        if (typeof patch.readOnlyChannel !== 'boolean')
            throw Object.assign(
                new Error('Read-only channel must be true or false.'),
                { status: 400 },
            );
        next.readOnlyChannel = patch.readOnlyChannel;
    }
    if ('autoDisconnect' in patch) {
        if (typeof patch.autoDisconnect !== 'boolean')
            throw Object.assign(
                new Error('Auto-disconnect must be true or false.'),
                { status: 400 },
            );
        next.autoDisconnect = patch.autoDisconnect;
    }
    if ('autoDisconnectSeconds' in patch) {
        if (!validIdleSeconds(patch.autoDisconnectSeconds))
            throw Object.assign(
                new Error(
                    `Enter a whole number from 1 to ${maxIdleSeconds} seconds.`,
                ),
                { status: 400 },
            );
        next.autoDisconnectSeconds = patch.autoDisconnectSeconds;
    }
    if ('enabled' in patch) {
        if (typeof patch.enabled !== 'boolean')
            throw new TypeError('Invalid enabled value');
        next.enabled = patch.enabled;
    }
    if ('announcementChannelId' in patch) {
        const id = patch.announcementChannelId;
        if (id !== null && (typeof id !== 'string' || !/^\d+$/.test(id))) {
            throw new TypeError('Invalid announcement channel');
        }
        next.announcementChannelId = id;
    }
    if (!store.set('player', next, guildId)) {
        throw Object.assign(new Error('Unable to save the player settings.'), {
            status: 500,
        });
    }
    return next;
}

function getPanels(guildId) {
    return store.get('playerPanels', {}, guildId);
}

function rememberPanel(guildId, channelId, messageId) {
    const panels = getPanels(guildId);
    if (panels[channelId] === messageId) return;
    if (
        !store.set(
            'playerPanels',
            { ...panels, [channelId]: messageId },
            guildId,
        )
    ) {
        throw new Error('Unable to save the player message ID.');
    }
}

module.exports = { get, set, defaultVolume, validVolume, getPanels, rememberPanel };
