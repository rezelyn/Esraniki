import { apiFetch, clearToken, getGuildId } from '../backend/api.js';
import { isActivity } from '../shared/activity.js';
import { dropdownTemplate, initializeDropdown } from '../shared/dropdown.js';
import { lucideIcon } from '../shared/style.js';

const QUEUE_PAGE_SIZE = 8;
const SEARCH_PAGE_SIZE = 5;
const svgImageUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const sources = [
    { value: 'global', label: 'Global Search', iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8995ad" stroke-width="2"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/></svg>') },
    { value: 'youtube', label: 'YouTube', iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" width="45.52" height="32" viewBox="0 0 256 180"><!-- Icon from theSVG Color by thesvg.org - https://github.com/glincker/thesvg/blob/main/LICENSE --><path fill="red" d="M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134Z"/><path fill="#fff" d="m102.421 128.06l66.328-38.418l-66.328-38.418z"/></svg>') },
    { value: 'soundcloud', label: 'SoundCloud', iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" width="71.63" height="32" viewBox="0 0 75 33.51"><!-- Icon from theSVG Color by thesvg.org - https://github.com/glincker/thesvg/blob/main/LICENSE --><path fill="#fff" d="M75 23.6a10.5 10.5 0 0 1-10.63 9.91H38.82a2.14 2.14 0 0 1-2.12-2.13V3.87a2.34 2.34 0 0 1 1.41-2.24S40.46 0 45.41 0A16.74 16.74 0 0 1 54 2.36a17 17 0 0 1 8 11.08a9.8 9.8 0 0 1 2.71-.37A10.23 10.23 0 0 1 75 23.6M33.51 5.61a.83.83 0 1 0-1.65 0c-.7 9.25-1.24 17.92 0 27.14a.83.83 0 0 0 1.65 0c1.33-9.3.77-17.81 0-27.14m-5.16 3.2a.87.87 0 0 0-1.73 0a103.7 103.7 0 0 0 0 23.95a.87.87 0 0 0 1.72 0a93.2 93.2 0 0 0 .01-23.95M23.16 8a.84.84 0 0 0-1.67 0c-.79 8.44-1.19 16.32 0 24.74a.83.83 0 0 0 1.66 0c1.23-8.53.85-16.19.01-24.74M18 10.41a.86.86 0 0 0-1.72 0a87.6 87.6 0 0 0 0 22.36a.85.85 0 0 0 1.69 0A81.7 81.7 0 0 0 18 10.41M12.79 16a.85.85 0 0 0-1.7 0c-1.23 5.76-.65 11 .05 16.83a.81.81 0 0 0 1.6 0c.77-5.91 1.36-11.03.05-16.83m-5.17-.88a.88.88 0 0 0-1.75 0C4.78 21 5.14 26.18 5.9 32.05c.08.89 1.59.88 1.69 0c.84-5.96 1.23-10.99.03-16.93M2.4 18a.88.88 0 0 0-1.75 0c-1 3.95-.69 7.22.07 11.18a.82.82 0 0 0 1.63 0c.88-4.04 1.31-7.24.05-11.18"/></svg>') },
    // not supported yet
    { value: 'spotify', label: 'Spotify', disabled: true, iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256"><!-- Icon from theSVG Color by thesvg.org - https://github.com/glincker/thesvg/blob/main/LICENSE --><path fill="#1ed760" d="M128 0C57.308 0 0 57.309 0 128c0 70.696 57.309 128 128 128c70.697 0 128-57.304 128-128C256 57.314 198.697.007 127.998.007l.001-.006Zm58.699 184.614c-2.293 3.76-7.215 4.952-10.975 2.644c-30.053-18.357-67.885-22.515-112.44-12.335a7.98 7.98 0 0 1-9.552-6.007a7.97 7.97 0 0 1 6-9.553c48.76-11.14 90.583-6.344 124.323 14.276c3.76 2.308 4.952 7.215 2.644 10.975m15.667-34.853c-2.89 4.695-9.034 6.178-13.726 3.289c-34.406-21.148-86.853-27.273-127.548-14.92c-5.278 1.594-10.852-1.38-12.454-6.649c-1.59-5.278 1.386-10.842 6.655-12.446c46.485-14.106 104.275-7.273 143.787 17.007c4.692 2.89 6.175 9.034 3.286 13.72zm1.345-36.293C162.457 88.964 94.394 86.71 55.007 98.666c-6.325 1.918-13.014-1.653-14.93-7.978c-1.917-6.328 1.65-13.012 7.98-14.935C93.27 62.027 168.434 64.68 215.929 92.876c5.702 3.376 7.566 10.724 4.188 16.405c-3.362 5.69-10.73 7.565-16.4 4.187z"/></svg>') },
    { value: 'applemusic', label: 'Apple Music', disabled: true, iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 361 361"><!-- Icon from theSVG Color by thesvg.org - https://github.com/glincker/thesvg/blob/main/LICENSE --><linearGradient id="SVG1t4kne3G" x1="180" x2="180" y1="358.605" y2="7.759" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fa233b"/><stop offset="1" stop-color="#fb5c74"/></linearGradient><path fill="url(#SVG1t4kne3G)" fill-rule="evenodd" d="M360 112.61c0-4.3 0-8.6-.02-12.9c-.02-3.62-.06-7.24-.16-10.86c-.21-7.89-.68-15.84-2.08-23.64c-1.42-7.92-3.75-15.29-7.41-22.49a75.63 75.63 0 0 0-33.06-33.05c-7.19-3.66-14.56-5.98-22.47-7.41C287 .86 279.04.39 271.15.18c-3.62-.1-7.24-.14-10.86-.16c-4.3-.02-8.6-.02-12.9-.02H112.61c-4.3 0-8.6 0-12.9.02c-3.62.02-7.24.06-10.86.16C80.96.4 73 .86 65.2 2.27c-7.92 1.42-15.28 3.75-22.47 7.41A75.63 75.63 0 0 0 9.67 42.73c-3.66 7.2-5.99 14.57-7.41 22.49C.86 73.02.39 80.98.18 88.86C.08 92.48.04 96.1.02 99.72C0 104.01 0 108.31 0 112.61v134.77c0 4.3 0 8.6.02 12.9c.02 3.62.06 7.24.16 10.86c.21 7.89.68 15.84 2.08 23.64c1.42 7.92 3.75 15.29 7.41 22.49a75.63 75.63 0 0 0 33.06 33.05c7.19 3.66 14.56 5.98 22.47 7.41c7.8 1.4 15.76 1.87 23.65 2.08c3.62.1 7.24.14 10.86.16c4.3.03 8.6.02 12.9.02h134.77c4.3 0 8.6 0 12.9-.02c3.62-.02 7.24-.06 10.86-.16c7.89-.21 15.85-.68 23.65-2.08c7.92-1.42 15.28-3.75 22.47-7.41a75.63 75.63 0 0 0 33.06-33.05c3.66-7.2 5.99-14.57 7.41-22.49c1.4-7.8 1.87-15.76 2.08-23.64c.1-3.62.14-7.24.16-10.86c.03-4.3.02-8.6.02-12.9V112.61z"/><path fill="#fff" fill-rule="evenodd" d="M254.5 55c-.87.08-8.6 1.45-9.53 1.64l-107 21.59l-.04.01c-2.79.59-4.98 1.58-6.67 3c-2.04 1.71-3.17 4.13-3.6 6.95c-.09.6-.24 1.82-.24 3.62v133.92c0 3.13-.25 6.17-2.37 8.76s-4.74 3.37-7.81 3.99l-6.99 1.41c-8.84 1.78-14.59 2.99-19.8 5.01c-4.98 1.93-8.71 4.39-11.68 7.51c-5.89 6.17-8.28 14.54-7.46 22.38c.7 6.69 3.71 13.09 8.88 17.82c3.49 3.2 7.85 5.63 12.99 6.66c5.33 1.07 11.01.7 19.31-.98c4.42-.89 8.56-2.28 12.5-4.61c3.9-2.3 7.24-5.37 9.85-9.11c2.62-3.75 4.31-7.92 5.24-12.35c.96-4.57 1.19-8.7 1.19-13.26V142.81c0-6.22 1.76-7.86 6.78-9.08c0 0 88.94-17.94 93.09-18.75c5.79-1.11 8.52.54 8.52 6.61v79.29c0 3.14-.03 6.32-2.17 8.92c-2.12 2.59-4.74 3.37-7.81 3.99l-6.99 1.41c-8.84 1.78-14.59 2.99-19.8 5.01c-4.98 1.93-8.71 4.39-11.68 7.51c-5.89 6.17-8.49 14.54-7.67 22.38c.7 6.69 3.92 13.09 9.09 17.82c3.49 3.2 7.85 5.56 12.99 6.6c5.33 1.07 11.01.69 19.31-.98c4.42-.89 8.56-2.22 12.5-4.55c3.9-2.3 7.24-5.37 9.85-9.11c2.62-3.75 4.31-7.92 5.24-12.35c.96-4.57 1-8.7 1-13.26V64.46c.02-6.16-3.23-9.96-9.02-9.46"/></svg>') },
    { value: 'deezer', label: 'Deezer', disabled: true, iconURL: svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from theSVG Color by thesvg.org - https://github.com/glincker/thesvg/blob/main/LICENSE --><path fill="#a238ff" d="M.693 10.024c.381 0 .693-1.256.693-2.807S1.074 4.41.693 4.41S0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5c-.312-2.158-.788-3.536-1.325-3.536c-.745 0-1.386 2.704-1.62 6.472c-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463c-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665c-.217-1.291-.546-2.105-.91-2.105c-.675 0-1.221 2.807-1.221 6.272s.546 6.273 1.221 6.273c.277 0 .537-.476.736-1.273c.32 2.928.996 4.938 1.776 4.938c.606 0 1.143-1.204 1.507-3.11c.251 3.622.875 6.195 1.602 6.195c.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24s1.863-2.4 2.235-5.822c.312 1.654.727 2.677 1.186 2.677c.728 0 1.352-2.573 1.603-6.195c.364 1.906.9 3.11 1.507 3.11c.78 0 1.455-2.01 1.775-4.938c.208.797.46 1.273.737 1.273c.675 0 1.22-2.807 1.22-6.273c-.008-3.457-.553-6.272-1.23-6.272Zm2.269 8.464c.381 0 .693-1.256.693-2.807s-.312-2.807-.693-2.807s-.693 1.256-.693 2.807s.312 2.808.693 2.808Z"/></svg>') },
];
const artworkMappings = new Map([
    ['i.ytimg.com', 'youtube-art'], ['i1.sndcdn.com', 'soundcloud-art'], ['a1.sndcdn.com', 'soundcloud-avatars'],
]);
const sourceLabel = track => track?.source === 'soundcloud' ? 'SoundCloud' : 'YouTube';

function duration(seconds) {
    if (!Number.isFinite(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    return minutes + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}

function artworkUrl(track) {
    if (!URL.canParse(track?.thumbnail)) return '';
    const url = new URL(track.thumbnail);
    const mapping = artworkMappings.get(url.host);
    if (!mapping || url.protocol !== 'https:') return '';
    return isActivity ? '/.proxy/' + mapping + url.pathname + url.search : url.href;
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
    const link = document.createElement('a');
    link.href = track.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = track.title;
    title.append(link);
    const meta = document.createElement('span');
    meta.className = 'label-hint';
    meta.textContent = [duration(track.duration), sourceLabel(track), track.requester].filter(Boolean).join(' • ');
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
                        <p class="label-text"><a data-id="title" target="_blank" rel="noopener noreferrer">Waiting for player status…</a></p><p class="label-hint" data-id="details"></p>
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
                        <div class="player-input">${dropdownTemplate({ id: 'player-source', options: sources, selectedValue: 'youtube', ariaLabel: 'Search source: YouTube' })}
                            <input id="music-query" type="text" data-id="query" aria-label="Search tracks or paste a link" placeholder="Search YouTube or paste a link" maxlength="500" required>
                            <button type="submit" class="btn secondary tooltip" data-id="submit"></button></div>
                    </fieldset>
                </form>
                <ul data-id="results" class="player-tracks"></ul>
                <span data-id="notice" class="label-hint" role="status" aria-live="polite"></span>
            </div>
            <nav class="stats-pagination" data-id="searchNav" aria-label="Search result pages" hidden>
                <button type="button" class="btn small" data-id="searchPrev" aria-label="Previous page">${window.lucide ? lucideIcon('chevron-left') : '‹'}</button>
                <code class="stats-page-info" data-id="searchPage" aria-live="polite"></code>
                <button type="button" class="btn small" data-id="searchNext" aria-label="Next page">${window.lucide ? lucideIcon('chevron-right') : '›'}</button>
            </nav>
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
    let channels;
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
    setButton(ui.submit, 'Search', 'search');
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
        ui.searchFields.disabled = ui.upcoming.hidden = !data.canControl;
        const s = data.snapshot;
        ui.controls.hidden = ui.volumeField.hidden = !s;
        displayQueue(queuePage);
        if (isAdmin) {
            const canConfigure = Object.hasOwn(data, 'announcementChannelId');
            ui.configuration.hidden = !canConfigure || !channels;
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
        if (!data.canControl && searchSession) resetResults();
        ui.searchNext.disabled = busy || !searchSession ||
            (!searchSession.hasMore && !searchSession.pending.length && searchSession.index + 1 >= searchSession.pages.length);
        ui.searchPrev.disabled = busy || !searchSession?.index;
        const t = s?.current;
        const state = s?.state ?? 'unavailable';
        const stateLabel = { loading: 'Loading', playing: 'Playing', paused: 'Paused', idle: 'Idle', unavailable: 'Stopped' }[state];
        if (ui.state.dataset.state !== state) {
            ui.state.dataset.state = state;
            ui.state.textContent = stateLabel || '';
        }
        ui.title.parentElement.className = s ? 'label-text' : 'label-hint';
        ui.title.textContent = s ? t?.title || 'Waiting for a track' : data.reason;
        if (t?.url) ui.title.href = t.url;
        else ui.title.removeAttribute('href');
        ui.details.textContent = [duration(t?.duration), t && sourceLabel(t), t?.requester && 'Requested by ' + t.requester].filter(Boolean).join(' • ');
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
        ui.volume.disabled = busy;
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
    let playerNoticeTimer;
    async function run(operation, notice = ui.notice) {
        if (busy || signal.aborted) return;
        busy = true;
        revision++;
        ui.submit.disabled = true;
        if (notice === ui.settingsStatus) clearTimeout(settingsStatusTimer);
        if (notice === ui.notice) clearTimeout(playerNoticeTimer);
        notice.className = '';
        notice.innerHTML = '<span class="spinner alt" role="img" aria-label="Loading"></span>';
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
                if (notice === ui.notice) {
                    playerNoticeTimer = setTimeout(() => { notice.textContent = ''; }, 5000);
                }
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
    async function enqueue(query, source) {
        const result = await request('/api/player/enqueue', { query, source });
        const messages = [`Added ${result.added} track${result.added === 1 ? '' : 's'}.`];
        if (result.unavailable) messages.push(`${result.unavailable} unavailable.`);
        if (result.omitted === null) messages.push('Additional playlist entries were omitted.');
        else if (result.omitted) messages.push(`${result.omitted} omitted.`);
        return messages.join(' ');
    }
    let searchSession;
    const inputIsLink = () => /^(?:https?:\/\/|[\w.-]+\.[a-z]{2,}\/)/i.test(ui.query.value.trim());
    function resetResults() {
        searchSession = null;
        ui.searchNav.hidden = true;
        if (inputIsLink()) setButton(ui.submit, 'Add to queue', 'list-plus');
        else setButton(ui.submit, 'Search', 'search');
        ui.results.replaceChildren();
    }
    function showSearchPage(session) {
        const { pages, index } = session;
        const canSearchDeeper = session.hasMore || session.pending.length > 0;
        const tracks = pages[index] || [];
        ui.results.replaceChildren(...tracks.map(track => trackRow(track, 'Add', () => run(() => enqueue(track.url, track.source)))));
        ui.searchNav.hidden = pages.length <= 1 && !canSearchDeeper;
        const totalPages = pages.length + Math.ceil(session.pending.length / SEARCH_PAGE_SIZE);
        ui.searchPage.textContent = (pages.length ? index + 1 : 0) + ' / ' + totalPages;
        ui.searchPrev.disabled = busy || index === 0;
        ui.searchNext.disabled = busy || (index + 1 >= pages.length && !canSearchDeeper);
    }
    function appendSearchPage(session) {
        session.index = session.pages.length;
        session.pages.push(session.pending.splice(0, SEARCH_PAGE_SIZE));
        showSearchPage(session);
    }
    async function fetchSearchBatch(session) {
        let result;
        try {
            result = await request('/api/player/search', { query: session.query, source: session.source, batch: session.batch + 1 });
        } catch (error) {
            if (session !== searchSession) return '';
            throw error;
        }
        if (signal.aborted || session !== searchSession) return '';
        session.batch++;
        session.hasMore = result.hasMore;
        session.pending = result.tracks.filter(track => {
            if (session.seen.has(track.url)) return false;
            session.seen.add(track.url);
            return true;
        });
        if (session.pending.length) {
            appendSearchPage(session);
            return '';
        }
        showSearchPage(session);
        return 'No new playable tracks found.';
    }
    ui.searchPrev.onclick = () => {
        searchSession.index--;
        showSearchPage(searchSession);
    };
    ui.searchNext.onclick = () => {
        if (searchSession.index + 1 < searchSession.pages.length) {
            searchSession.index++;
            showSearchPage(searchSession);
        } else if (searchSession.pending.length) {
            appendSearchPage(searchSession);
        } else {
            run(() => fetchSearchBatch(searchSession));
        }
    };
    const picker = page.querySelector('#player-source');
    const sourcePicker = initializeDropdown(picker, sources, option => {
        picker.querySelector('[data-dropdown-trigger]').setAttribute('aria-label', 'Search source: ' + option.label);
        const scope = option.value === 'global' ? 'all providers' : option.label;
        ui.query.placeholder = 'Search ' + scope + ' or paste a link';
        resetResults();
    });
    ui.query.oninput = resetResults;
    ui.library.onsubmit = event => {
        event.preventDefault();
        const query = ui.query.value.trim();
        if (!query || busy) return;
        const source = sourcePicker.getSelectedValue();
        resetResults();
        if (inputIsLink()) return run(() => enqueue(query, source === 'global' ? undefined : source));
        searchSession = { query, source, batch: 0, pages: [], pending: [], seen: new Set(), index: 0, hasMore: true };
        run(() => fetchSearchBatch(searchSession));
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
        if (!channels) return;
        if (channelPicker) {
            channelPicker.setSelected(channels.some(channel => channel.id === value) ? value : '');
            return;
        }
        const options = [{ value: '', label: 'Select a channel' },
            ...channels.map(channel => ({ value: channel.id, label: '#' + channel.name }))];
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
        }).catch(error => {
            if (signal.aborted) return;
            channels = [];
            ui.notice.textContent = error.message;
        }).then(() => {
            if (!signal.aborted && model) display(model);
        });
    }
    let polling = false;
    async function poll() {
        if (busy || polling || document.hidden || signal.aborted) return;
        polling = true;
        try { await refresh(); } finally { polling = false; }
    }
    const timer = setInterval(poll, 3000);
    document.addEventListener('visibilitychange', poll, { signal });
    signal.addEventListener('abort', () => {
        clearInterval(timer);
        clearTimeout(playerNoticeTimer);
    }, { once: true });
    await poll();
}
