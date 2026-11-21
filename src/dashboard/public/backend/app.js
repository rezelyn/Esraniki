import { renderHome } from '../pages/home.js';
import { renderRules } from '../pages/rules.js';
import { renderStats } from '../pages/stats.js';
import { renderMinecraft } from '../pages/minecraft.js';
import { renderTwitch } from '../pages/twitch.js';
import { renderPlayer } from '../pages/player.js';
import { renderShrimp } from '../pages/shrimp.js';
import {
    getToken,
    setToken,
    clearToken,
    getGuildId,
    setGuildId,
    setIsOwner,
    apiFetch,
} from './api.js';
import { isActivity, getDiscordSdk } from '../shared/activity.js';
import { dropdownTemplate, initializeDropdown } from '../shared/dropdown.js';

const modal = document.getElementById('auth-modal');
const shell = document.getElementById('shell');
const err = document.getElementById('auth-error');

const pages = {
    home: renderHome,
    rules: renderRules,
    stats: renderStats,
    minecraft: renderMinecraft,
    twitch: renderTwitch,
    player: renderPlayer,
    shrimp: renderShrimp
};

const AUTH_ERRORS = {
    no_code: 'Authentication was cancelled.',
    auth_failed: 'Discord authentication failed.',
    no_access: 'Join a Discord server that has Esraniki to use the dashboard.',
    server_error: 'An internal error occurred. Please try again.'
};

const THEMES = ['latte', 'discord', 'mocha', 'macchiato', 'frappe'];
const THEME_STORAGE_KEY = 'esraniki-theme';

let createIcons = false;
function renderIcons() {
    if (createIcons) return;
    createIcons = true;
    requestAnimationFrame(() => {
        createIcons = false;
        window.lucide?.createIcons();
    });
}

new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            renderIcons();
            return;
        }
    }
}).observe(document.body, { childList: true, subtree: true });

function currentTheme(theme) {
    const themeName = theme === 'frappe' ? 'Frappé' : theme[0].toUpperCase() + theme.slice(1);
    return theme === 'discord' ? themeName : `Catppuccin ${themeName}`;
}

function applyTheme(theme, persist = false) {
    const nextTheme = THEMES.includes(theme) ? theme : 'mocha';
    document.documentElement.dataset.theme = nextTheme;

    const button = document.getElementById('theme-toggle');
    if (button) {
        const label = `${currentTheme(nextTheme)}`;
        button.setAttribute('aria-label', label);
        button.title = label;
    }

    if (persist) localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}

function themeToggle() {
    let defaultTheme = 'mocha';
    try {
        defaultTheme = localStorage.getItem(THEME_STORAGE_KEY) ?? defaultTheme;
    } catch {}
    applyTheme(defaultTheme);

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const currentTheme = document.documentElement.dataset.theme;
        const nextTheme = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
        applyTheme(nextTheme, true);
    });
}

themeToggle();

function currentPage() {
    return location.hash.slice(1) || 'home';
}

let guilds = [];
let activityGuildId;
let navigation;
async function navigate() {
    navigation?.abort();
    navigation = new AbortController();
    const { signal } = navigation;
    const isAdmin = guilds.some(guild => guild.id === getGuildId() && guild.isAdmin);
    const page = isAdmin ? currentPage() : 'player';
    if (!isAdmin && currentPage() !== page) {
        const url = new URL(location.href);
        url.hash = page;
        history.replaceState({}, '', url);
    }
    for (const item of document.querySelectorAll('ul.sidebar-nav > li')) {
        item.hidden = !isAdmin && !item.querySelector('[data-page="player"]');
    }
    document.querySelectorAll('.sidebar-nav.link').forEach((element) => {
        element.classList.toggle('active', element.dataset.page === page);
    });
    const content = document.getElementById('content');
    await new Promise((resolve) => {
        content.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        content.style.opacity = '0';
        content.style.transform = 'translateY(-4px)';
        setTimeout(resolve, 150);
    });

    if (signal.aborted) return;
    content.innerHTML = '';
    content.style.transition = '';
    content.style.opacity = '';
    content.style.transform = '';

    const render = pages[page] ?? pages.home;
    const mount = document.createElement('div');
    content.append(mount);
    await render(mount, { signal, isAdmin });
    if (signal.aborted) return;

    content.style.animation = 'none';
    void content.offsetWidth;
    content.style.animation = '';
}

async function showApp() {
    modal.style.display = 'none';
    shell.style.display = 'flex';
    await loadBranding();
    navigate();
}

async function loadUser() {
    try {
        const response = await apiFetch('/api/me');
        if (!response.ok) return;
        const { username, avatar, isOwner } = await response.json();
        setIsOwner(Boolean(isOwner));
        const profile = document.getElementById('sidebar-user-name');
        const image = document.getElementById('sidebar-user-avatar');
        if (profile) profile.textContent = username;
        if (image && avatar) image.src = avatar;
    } catch {}
}

async function loadBranding() {
    await loadUser();
    try {
        const [statusRes, guildsRes] = await Promise.all([
            apiFetch('/api/brand'),
            apiFetch('/api/guilds')
        ]);

        if (statusRes.ok) {
            const { avatarURL, version } = await statusRes.json();
            if (avatarURL) {
                document.getElementById('sidebar-avatar').src = avatarURL;
                document.getElementById('favicon').href = avatarURL;
            }

            if (version) {
                const el = document.getElementById('sidebar-version');
                if (el) el.textContent = 'v' + version;
            }
        }

        if (guildsRes.ok) {
            guilds = await guildsRes.json();
            if (activityGuildId && guilds.some(g => g.id === activityGuildId)) {
                setGuildId(activityGuildId);
            } else if (!getGuildId() || !guilds.find((g) => g.id === getGuildId())) {
                setGuildId(guilds[0]?.id ?? '');
            }
            renderGuildPicker(guilds);
        }
    } catch {}
}

function renderGuildPicker(guilds) {
    const current = guilds.find((g) => g.id === getGuildId()) ?? guilds[0];
    const guildPicker = document.getElementById('guild-picker');
    const options = guilds.map((guild) => ({
        value: guild.id,
        label: guild.name,
        iconURL: guild.iconURL
    }));

    guildPicker.innerHTML = dropdownTemplate({
        id: 'guild-picker-menu',
        options,
        selectedValue: current?.id,
        ariaLabel: 'Select a server'
    });

    initializeDropdown(
        guildPicker.querySelector('[data-dropdown]'),
        options,
        (option) => {
            setGuildId(option.value);
            navigate();
        }
    );
}

document.getElementById('logout-btn').onclick = async () => {
    await apiFetch('/api/logout', {
        method: 'POST',
    }).catch(() => null);
    clearToken();
};

window.addEventListener('hashchange', navigate);

// pick up session token from OAuth callback redirect
const urlParams = new URLSearchParams(location.search);
const sessionFromUrl = urlParams.get('s');
const errorFromUrl = urlParams.get('error');

if (sessionFromUrl) {
    setToken(sessionFromUrl);
    history.replaceState({}, '', '/');
}

if (errorFromUrl) {
    if (err) {
        err.textContent = AUTH_ERRORS[errorFromUrl] || 'Login failed. Please try again.';
        err.style.display = 'block';
    }
    history.replaceState({}, '', '/');
}

const loginLink = document.getElementById('login-link');
const activitySpinner = document.getElementById('activity-spinner');
const activityRetryBtn = document.getElementById('activity-retry-btn');
const loginHint = document.getElementById('login-hint');

async function activityLogin() {
    if (err) err.style.display = 'none';
    activityRetryBtn.style.display = 'none';
    activitySpinner.style.display = 'flex';
    loginHint.textContent = 'Connecting to Discord...';

    try {
        const brandRes = await apiFetch('/api/brand');
        const brand = brandRes.ok ? await brandRes.json() : null;
        if (!brand?.clientId) throw new Error('missing_client_id');

        const sdk = await getDiscordSdk(brand.clientId);
        activityGuildId = sdk.guildId;
        const { code } = await sdk.commands.authorize({
            client_id: brand.clientId,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify', 'guilds']
        });

        const tokenRes = await apiFetch('/api/activity/token', {
            method: 'POST',
            body: JSON.stringify({ code })
        });

        if (!tokenRes.ok) {
            const data = await tokenRes.json().catch(() => ({}));
            throw new Error(data.error || 'auth_failed');
        }

        const { session, accessToken } = await tokenRes.json();
        setToken(session);

        if (accessToken) {
            await sdk.commands.authenticate({ access_token: accessToken }).catch(() => null);
        }

        await showApp();
    } catch (e) {
        console.error('Activity login failed:', e);
        activitySpinner.style.display = 'none';
        loginHint.textContent = 'Discord authentication failed.';
        activityRetryBtn.style.display = 'inline-flex';
    }
}

if (isActivity) {
    if (loginLink) loginLink.style.display = 'none';
    activityRetryBtn.addEventListener('click', activityLogin);
    activityLogin();
}

if (!isActivity && getToken()) {
    apiFetch('/api/me')
        .then((response) => {
            if (response.ok) return showApp();
            clearToken();
        })
        .catch(() => null);
}

apiFetch('/api/brand')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
        if (!data?.avatarURL) return;
        const image = document.getElementById('login-avatar');
        if (image) image.src = data.avatarURL;
    })
    .catch(() => null);
