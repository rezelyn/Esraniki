import { apiFetch, clearToken, getGuildId } from '../backend/api.js';
import { isActivity } from '../shared/activity.js';
import { dropdownTemplate, initializeDropdown } from '../shared/dropdown.js';
import { lucideIcon } from '../shared/style.js';

const QUEUE_PAGE_SIZE = 8;

function duration(seconds) {
    if (!Number.isFinite(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    return minutes + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}

function artworkUrl(track) {
    if (!track?.thumbnail || !/^https:\/\/i\.ytimg\.com\//i.test(track.thumbnail)) return '';
    return isActivity ? '/.proxy/youtube-art' + new URL(track.thumbnail).pathname : track.thumbnail;
}

function trackRow(track, buttonLabel, action) {
    const row = document.createElement('li');
    const artwork = artworkUrl(track);
    if (artwork) {
        const image = document.createElement('img');
        image.className = 'player-track-art';
        image.alt = '';
        image.loading = 'lazy';
        image.src = artwork;
        image.onerror = () => image.hidden = true;
        row.append(image);
    }
    const title = document.createElement('span');
    title.className = 'player-track-title';
    title.textContent = track.title;
    const meta = document.createElement('span');
    meta.className = 'label-hint';
    meta.textContent = [duration(track.duration), track.requester].filter(Boolean).join(' • ');
    title.append(meta);
    row.append(title);
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', buttonLabel + ': ' + track.title);
    button.onclick = action;
    if (buttonLabel === 'Remove from queue') {
        button.className = 'btn danger xs tooltip';
        button.setAttribute('tooltip', 'Remove');
        button.innerHTML = window.lucide ? lucideIcon('x', 'icon') : '×';
        row.prepend(button);
    } else {
        button.className = 'btn secondary';
        button.textContent = buttonLabel;
        row.append(button);
    }
    return row;
}

export async function renderPlayer(page, { signal, isAdmin }) {
    const guild = getGuildId();
    page.className = 'player-layout';
    page.innerHTML = `
        <div class="player-left">
            <section class="card">
                <div class="card-header"><h1 class="label-header">${lucideIcon('music', 'icon')} Player</h1><span class="status player-state" data-id="state" role="status"></span></div>
                <div class="card-body player-playback">
                    <div class="player-current"><img data-id="art" alt="" hidden><div>
                        <p class="label-text" data-id="title">Waiting for player status…</p><p class="label-hint" data-id="details"></p>
                    </div></div>
                    <div class="player-controls" data-id="controls" hidden></div>
                    <div class="player-volume" data-id="volumeField" hidden>
                        <input data-id="volume" type="range" min="0" max="200" step="10" aria-label="Volume">
                        <div class="player-volume-travel" aria-hidden="true"><span class="tooltip player-volume-knob" data-id="volumeTip">${lucideIcon('volume-2', 'icon')}</span></div>
                    </div>
                    <span class="status error" data-id="playError" role="status" hidden></span>
                </div>
            </section>
            ${isAdmin ? `<section data-id="configuration" hidden><form data-id="settings">
                <div class="card">
                    <div class="card-header">
                        <h2 class="label-header">${lucideIcon('settings', 'icon')} Server settings</h2>
                        <span id="player-settings-status" data-id="settingsStatus" role="status"></span>
                    </div>
                    <div class="card-body">
                        <div class="field"><label class="label-option" for="player-channel-trigger">Now Playing channel</label><div data-id="channel"></div></div>
                        <div>
                            <label class="settings-check-row"><input type="checkbox" data-id="readOnlyChannel"><span class="label-checkbox">Read-only channel</span></label>
                            <label class="settings-check-row"><input type="checkbox" data-id="enabled"><span class="label-checkbox">Enable music for this server</span></label>
                            <label class="settings-check-row"><input type="checkbox" data-id="autoDisconnect"><span class="label-checkbox">Auto-disconnect</span></label>
                        </div>
                        <div class="field"><label class="label-option" for="player-idle-seconds">Auto-disconnect time (seconds)</label>
                            <div class="num-input-wrap">
                                <input id="player-idle-seconds" data-id="idleSeconds" type="number" min="1" max="2147483" step="1" required aria-describedby="player-idle-hint">
                                <div class="num-input-btns">
                                    <button type="button" class="num-input-btn" data-id="increase" aria-label="Increase disconnect time">${lucideIcon('arrow-up', 'icon')}</button>
                                    <button type="button" class="num-input-btn" data-id="decrease" aria-label="Decrease disconnect time">${lucideIcon('arrow-down', 'icon')}</button>
                                </div>
                            </div>
                            <p class="label-hint" id="player-idle-hint">Time to wait when playback is paused or the queue is empty.</p>
                        </div>
                    </div>
                </div>
                <div class="actions"><button type="button" class="btn secondary" data-id="discard" disabled>Discard changes</button>
                    <button class="btn primary" data-id="save" disabled>Save changes</button></div>
            </form></section>` : ''}
        </div>
        <div class="player-right">
        <section class="card">
            <div class="card-header"><h2 class="label-header">${lucideIcon('search', 'icon')} Search</h2></div>
            <div class="card-body">
                <form data-id="library">
                    <fieldset class="player-search-fields" data-id="searchFields" disabled>
                        <div class="player-input"><input id="music-query" type="text" data-id="query" aria-label="Search YouTube or paste a link" placeholder="Search YouTube or paste a link" maxlength="500" required>
                            <button class="btn primary" data-id="submit">Search</button></div>
                        <label class="settings-check-row" data-id="playlistChoice" hidden><input type="checkbox" data-id="playlist"><span class="label-checkbox">Add the whole playlist</span></label>
                    </fieldset>
                </form>
                <p data-id="access" class="label-hint" role="status">Connecting to the player…</p>
                <ul data-id="results" class="player-tracks"></ul>
                <span data-id="notice" class="label-hint" role="status" aria-live="polite"></span>
            </div>
        </section>
        <section class="card" data-id="upcoming" hidden>
            <div class="card-header"><h2 class="label-header">${lucideIcon('list-music', 'icon')} Up next</h2><button class="btn danger xs tooltip player-clear" data-id="clear"></button></div>
            <div class="card-body"><p data-id="empty" class="label-hint">The queue is empty.</p><ol data-id="queue" class="player-tracks"></ol></div>
            <nav class="stats-pagination" data-id="pagination" aria-label="Queue pages" hidden>
                <button type="button" class="btn small" data-id="prevPage"></button>
                <code class="stats-page-info" data-id="pageNumber" aria-live="polite"></code>
                <button type="button" class="btn small" data-id="nextPage"></button>
            </nav>
        </section>
        </div>`;
    const ui = Object.fromEntries([...page.querySelectorAll('[data-id]')].map(el => [el.dataset.id, el]));
    let revision = 0;
    let busy = false;
    let settingsDirty = false;
    let model;
    let selectedChannel = '';
    let channels = [];
    let channelPicker;
    let channelsLoaded = false;
    let renderedQueue = '';
    let queuePage = 0;

    async function request(path, body) {
        const options = body ? { method: 'POST', body: JSON.stringify(body) } : {};
        const response = await apiFetch(path + '?guild=' + encodeURIComponent(guild), { ...options, signal });
        if (response.status === 401 && !signal.aborted) clearToken();
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The request failed.');
        return result;
    }

    const actions = [
        ['shuffle', 'Shuffle', 'shuffle'], ['previous', 'Previous', 'skip-back'], ['pause', 'Pause', 'pause'],
        ['skip', 'Skip', 'skip-forward'], ['repeat', 'Repeat track', 'repeat-1'], ['stop', 'Stop and disconnect', 'square']
    ];
    const buttons = {};
    function setButton(button, label, icon) {
        button.setAttribute('tooltip', label);
        button.setAttribute('aria-label', label);
        button.innerHTML = lucideIcon(icon);
        if (!window.lucide) {
            button.classList.remove('small');
            button.textContent = label;
        }
    }
    setButton(ui.clear, 'Clear queue', 'trash-2');
    setButton(ui.prevPage, 'Previous page', 'chevron-left');
    setButton(ui.nextPage, 'Next page', 'chevron-right');
    ui.prevPage.onclick = () => displayQueue(queuePage - 1);
    ui.nextPage.onclick = () => displayQueue(queuePage + 1);
    for (const [action, label, icon] of actions) {
        const button = document.createElement('button');
        button.className = 'btn small tooltip' + (action === 'stop' ? ' danger' : '');
        setButton(button, label, icon);
        button.onclick = () => control(action === 'pause' && model.snapshot.state === 'paused' ? 'resume' : action);
        ui.controls.append(button);
        buttons[action] = button;
    }

    function displayQueue(pageIndex) {
        const queue = model.snapshot?.queue ?? [];
        const pages = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
        queuePage = Math.max(0, Math.min(pageIndex, pages - 1));
        const start = queuePage * QUEUE_PAGE_SIZE;
        const tracks = queue.slice(start, start + QUEUE_PAGE_SIZE);
        const sessionId = model.snapshot?.sessionId;
        const queueKey = JSON.stringify([sessionId, tracks]);
        if (renderedQueue !== queueKey) {
            ui.queue.replaceChildren(...tracks.map(track => trackRow(track, 'Remove from queue',
                () => control('remove', track.sequence, sessionId))));
            renderedQueue = queueKey;
        }
        ui.queue.start = start + 1;
        ui.pagination.hidden = pages === 1;
        ui.pageNumber.textContent = (queuePage + 1) + ' / ' + pages;
        ui.prevPage.disabled = queuePage === 0;
        ui.nextPage.disabled = queuePage === pages - 1;
        ui.empty.hidden = queue.length > 0;
        ui.clear.disabled = busy || !queue.length;
        for (const button of ui.queue.querySelectorAll('button')) button.disabled = busy;
    }

    function display(data) {
        if (model?.snapshot?.sessionId !== data.snapshot?.sessionId) queuePage = 0;
        model = data;
        ui.access.textContent = data.reason || '';
        ui.searchFields.disabled = ui.upcoming.hidden = !data.canControl;
        const s = data.snapshot;
        ui.controls.hidden = ui.volumeField.hidden = !s;
        displayQueue(queuePage);
        if (isAdmin) {
            const canConfigure = Object.hasOwn(data, 'announcementChannelId');
            ui.configuration.hidden = !canConfigure;
            ui.enabled.disabled = !canConfigure;
            if (canConfigure && !settingsDirty) {
                ui.enabled.checked = data.enabled;
                ui.readOnlyChannel.checked = data.readOnlyChannel;
                ui.autoDisconnect.checked = data.autoDisconnect;
                ui.idleSeconds.value = data.autoDisconnectSeconds;
                ui.increase.disabled = ui.decrease.disabled = ui.idleSeconds.disabled = !data.autoDisconnect;
                selectAnnouncement(data.announcementChannelId);
            }
        }
        if (!data.canControl) ui.results.replaceChildren();
        const t = s?.current;
        const state = s?.state ?? 'unavailable';
        const stateLabel = { loading: 'Loading', playing: 'Playing', paused: 'Paused', idle: 'Idle', unavailable: 'Unavailable' }[state];
        if (ui.state.dataset.state !== state) {
            ui.state.dataset.state = state;
            ui.state.textContent = stateLabel || '';
        }
        ui.title.textContent = s ? t?.title || 'Waiting for a track' : 'Playback unavailable';
        ui.details.textContent = [duration(t?.duration), t?.requester && 'Requested by ' + t.requester].filter(Boolean).join(' • ');
        const artwork = artworkUrl(t);
        if (artwork) {
            if (ui.art.getAttribute('src') !== artwork) ui.art.src = artwork;
            ui.art.hidden = false;
        } else {
            ui.art.removeAttribute('src');
            ui.art.hidden = true;
        }
        ui.playError.textContent = s?.error || data.announcementWarning || '';
        ui.playError.hidden = !ui.playError.textContent;
        if (!s) return;
        const pauseLabel = s.state === 'paused' ? 'Resume' : 'Pause';
        if (buttons.pause.getAttribute('aria-label') !== pauseLabel) {
            setButton(buttons.pause, pauseLabel, s.state === 'paused' ? 'play' : 'pause');
        }
        buttons.pause.disabled = busy || !['playing','paused'].includes(s.state);
        buttons.previous.disabled = busy || !s.hasPrevious;
        buttons.skip.disabled = busy || !t;
        buttons.stop.disabled = busy || !s.channelId;
        for (const action of ['repeat','shuffle']) {
            buttons[action].disabled = busy || !s.channelId;
            buttons[action].setAttribute('aria-pressed', String(s[action]));
            buttons[action].classList.toggle('active', s[action]);
        }
        if (!ui.volume.matches(':active')) ui.volume.value = s.volume;
        ui.volume.disabled = busy || !s.channelId;
        updateVolumeTooltip();
    }

    async function refresh() {
        const read = ++revision;
        try {
            const data = await request('/api/player');
            if (!signal.aborted && read === revision) display(data);
        } catch (error) {
            if (!signal.aborted && read === revision) {
                display({ canControl: false, reason: error.message, snapshot: null });
            }
        }
    }

    let settingsStatusTimer;
    async function run(operation, notice = ui.notice) {
        if (busy || signal.aborted) return;
        busy = true;
        revision++;
        ui.submit.disabled = true;
        if (notice === ui.settingsStatus) clearTimeout(settingsStatusTimer);
        notice.textContent = 'Working…';
        notice.className = 'label-hint';
        if (model) display(model);
        try {
            const message = await operation();
            if (!signal.aborted) {
                notice.className = 'status success';
                notice.textContent = message || '';
                if (notice === ui.settingsStatus) {
                    settingsStatusTimer = setTimeout(() => notice.classList.add('hiding'), 3000);
                }
            }
        } catch (error) {
            if (!signal.aborted) {
                notice.className = 'status error';
                notice.textContent = error.message;
            }
        } finally {
            busy = false;
            if (!signal.aborted) {
                ui.submit.disabled = false;
                await refresh();
            }
        }
    }
    function control(action, value, sessionId = model?.snapshot?.sessionId) {
        return run(() => request('/api/player/control', { action, value, sessionId }).then(() => ''));
    }
    async function enqueue(query, playlist) {
        const result = await request('/api/player/enqueue', { query, playlist });
        const messages = [`Added ${result.added} track${result.added === 1 ? '' : 's'}.`];
        if (result.unavailable) messages.push(`${result.unavailable} unavailable.`);
        if (result.omitted === null) messages.push('Additional playlist entries were omitted.');
        else if (result.omitted) messages.push(`${result.omitted} omitted.`);
        return messages.join(' ');
    }
    function inputUrl() {
        const input = ui.query.value.trim();
        if (/^(?:(?:www|music|m)\.)?(?:youtube\.com|youtu\.be)\//i.test(input)) return new URL('https://' + input);
        try { return new URL(input); } catch { return null; }
    }
    ui.query.oninput = () => {
        const url = inputUrl();
        ui.submit.textContent = url ? 'Add to queue' : 'Search';
        ui.playlistChoice.hidden = !url?.searchParams.has('list') || url.pathname === '/playlist';
        if (ui.playlistChoice.hidden) ui.playlist.checked = false;
        ui.results.replaceChildren();
    };
    ui.library.onsubmit = event => {
        event.preventDefault();
        const query = ui.query.value.trim();
        if (!query) return;
        run(async () => {
            if (inputUrl()) return enqueue(query, ui.playlist.checked);
            const { tracks } = await request('/api/player/search', { query });
            if (signal.aborted || ui.query.value.trim() !== query) return '';
            ui.results.replaceChildren(...tracks.map(track => trackRow(track, 'Add', () => run(() => enqueue(track.url, false)))));
            return tracks.length ? '' : 'No playable videos found.';
        });
    };
    ui.clear.onclick = () => control('clear');
    function updateVolumeTooltip() {
        const { value, min, max } = ui.volume;
        ui.volumeField.style.setProperty('--volume-position', (100 * (value - min) / (max - min)) + '%');
        ui.volumeTip.setAttribute('tooltip', 'Volume • ' + value + '%');
        ui.volume.setAttribute('aria-valuetext', value + '%');
    }
    ui.volume.onpointermove = event => {
        const knob = ui.volumeTip.getBoundingClientRect();
        ui.volumeTip.classList.toggle('hovered', event.clientX >= knob.left && event.clientX <= knob.right
            && event.clientY >= knob.top && event.clientY <= knob.bottom);
    };
    ui.volume.onpointerleave = () => ui.volumeTip.classList.remove('hovered');
    ui.volume.oninput = updateVolumeTooltip;
    ui.volume.onchange = () => control('volume', Number(ui.volume.value));

    function selectAnnouncement(id) {
        const value = id || '';
        if (channelPicker && value === selectedChannel) return;
        selectedChannel = value;
        if (channelPicker && (!value || channels.some(channel => channel.id === value))) {
            channelPicker.setSelected(value);
            return;
        }
        const options = [{ value: '', label: 'Voice channel chat' },
            ...channels.map(channel => ({ value: channel.id, label: '#' + channel.name }))];
        if (value && !options.some(option => option.value === value)) {
            options.push({ value, label: 'Configured channel (' + value + ')' });
        }
        ui.channel.innerHTML = dropdownTemplate({ id: 'player-channel', options, selectedValue: value,
            ariaLabel: 'Select Now Playing channel', className: 'dropdown-menu--field' });
        const dropdown = ui.channel.firstElementChild;
        const trigger = dropdown.querySelector('[data-dropdown-trigger]');
        trigger.id = 'player-channel-trigger';
        trigger.disabled = !channelsLoaded;
        channelPicker = initializeDropdown(dropdown, options, option => {
            selectedChannel = option.value;
            updateSettingsActions();
        });
    }
    function updateSettingsActions() {
        ui.increase.disabled = ui.decrease.disabled = ui.idleSeconds.disabled = !ui.autoDisconnect.checked;
        settingsDirty = !!model && (ui.enabled.checked !== model.enabled || selectedChannel !== (model.announcementChannelId || '')
            || ui.readOnlyChannel.checked !== model.readOnlyChannel
            || ui.autoDisconnect.checked !== model.autoDisconnect || (!ui.idleSeconds.disabled && ui.idleSeconds.valueAsNumber !== model.autoDisconnectSeconds));
        ui.discard.disabled = !settingsDirty;
        ui.save.disabled = !settingsDirty || !ui.idleSeconds.validity.valid;
    }
    if (isAdmin) {
        ui.settingsStatus.addEventListener('animationend', event => {
            if (event.animationName === 'status-out') ui.settingsStatus.textContent = '';
        }, { signal });
        signal.addEventListener('abort', () => clearTimeout(settingsStatusTimer), { once: true });
        ui.enabled.disabled = true;
        ui.enabled.onchange = updateSettingsActions;
        ui.readOnlyChannel.onchange = updateSettingsActions;
        ui.increase.onclick = () => { ui.idleSeconds.stepUp(); updateSettingsActions(); };
        ui.decrease.onclick = () => { ui.idleSeconds.stepDown(); updateSettingsActions(); };
        ui.autoDisconnect.onchange = updateSettingsActions;
        ui.idleSeconds.oninput = updateSettingsActions;
        ui.discard.onclick = () => {
            settingsDirty = false;
            display(model);
            updateSettingsActions();
        };
        ui.settings.onsubmit = event => {
            event.preventDefault();
            run(async () => {
                const patch = { enabled: ui.enabled.checked };
                if (ui.readOnlyChannel.checked !== model.readOnlyChannel) patch.readOnlyChannel = ui.readOnlyChannel.checked;
                if (ui.autoDisconnect.checked !== model.autoDisconnect) patch.autoDisconnect = ui.autoDisconnect.checked;
                if (!ui.idleSeconds.disabled && ui.idleSeconds.valueAsNumber !== model.autoDisconnectSeconds) {
                    patch.autoDisconnectSeconds = ui.idleSeconds.valueAsNumber;
                }
                const channel = selectedChannel || null;
                if (channelsLoaded && channel !== model.announcementChannelId) patch.announcementChannelId = channel;
                await request('/api/player/settings', patch);
                settingsDirty = false;
                ui.discard.disabled = ui.save.disabled = true;
                return 'Settings saved.';
            }, ui.settingsStatus);
        };
        request('/api/channels').then(result => {
            if (signal.aborted) return;
            channels = result;
            channelsLoaded = true;
            channelPicker = null;
            selectAnnouncement(selectedChannel);
        }).catch(error => { if (!signal.aborted) ui.notice.textContent = error.message; });
    }
    let polling = false;
    async function poll() {
        if (busy || polling || document.hidden || signal.aborted) return;
        polling = true;
        try { await refresh(); } finally { polling = false; }
    }
    const timer = setInterval(poll, 3000);
    document.addEventListener('visibilitychange', poll, { signal });
    signal.addEventListener('abort', () => clearInterval(timer), { once: true });
    await poll();
}
