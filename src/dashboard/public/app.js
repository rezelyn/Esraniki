import { renderHome } from './pages/home.js';
import { renderRules } from './pages/rules.js';
import { renderStats } from './pages/stats.js';
import { renderMinecraft } from './pages/minecraft.js';
import { renderTwitch } from './pages/twitch.js';
import {
    getToken,
    setToken,
    clearToken,
    getGuildId,
    setGuildId,
    apiFetch,
} from './api.js';
import { dropdownTemplate, initializeDropdown } from './shared/dropdown.js';

const modal = document.getElementById('auth-modal');
const shell = document.getElementById('shell');
const err = document.getElementById('auth-error');

const pages = {
    home: renderHome,
    rules: renderRules,
    stats: renderStats,
    minecraft: renderMinecraft,
    twitch: renderTwitch
};

const AUTH_ERRORS = {
    no_code: 'Authentication was cancelled.',
    auth_failed: 'Discord authentication failed.',
    no_access: 'You don\'t have administrator access to any server associated with Esraniki.',
    server_error: 'An internal error occurred. Please try again.'
};

const THEMES = ['latte', 'mocha', 'macchiato', 'frappe'];
const THEME_STORAGE_KEY = 'esraniki-theme';

function currentTheme(theme) {
    return `Catppuccin ${theme === 'frappe' ? 'Frappé' : theme[0].toUpperCase() + theme.slice(1)}`;
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

async function navigate() {
    const page = currentPage();
    document.querySelectorAll('.nav-link').forEach((element) => {
        element.classList.toggle('active', element.dataset.page === page);
    });
    const content = document.getElementById('content');
    await new Promise((resolve) => {
        content.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        content.style.opacity = '0';
        content.style.transform = 'translateY(-4px)';
        setTimeout(resolve, 150);
    });

    content.innerHTML = '';
    content.style.transition = '';
    content.style.opacity = '';
    content.style.transform = '';

    const render = pages[page] ?? pages.home;
    await render(content);

    content.style.animation = 'none';
    void content.offsetWidth;
    content.style.animation = '';

    window.lucide?.createIcons({
        nodes: [document.getElementById('sidebar')],
    });
}

async function showApp() {
    modal.style.display = 'none';
    shell.style.display = 'flex';
    window.lucide?.createIcons();
    await loadBranding();
    navigate();
}

async function loadUser() {
    try {
        const response = await apiFetch('/api/me');
        if (!response.ok) return;
        const { username, avatar } = await response.json();
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
            apiFetch('/api/status'),
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
            const guilds = await guildsRes.json();
            if (!getGuildId() || !guilds.find((g) => g.id === getGuildId())) {
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

if (getToken()) {
    apiFetch('/api/me')
        .then((response) => {
            if (response.ok) return showApp();
            clearToken();
        })
        .catch(() => null);
}

fetch('/api/brand')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
        if (!data?.avatarURL) return;
        const image = document.getElementById('login-avatar');
        if (image) image.src = data.avatarURL;
    })
    .catch(() => null);
