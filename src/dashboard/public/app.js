import {
    renderHome
} from "./pages/home.js";
import {
    renderRules
} from "./pages/rules.js";
import {
    renderStats
} from "./pages/stats.js";
import {
    renderMinecraft
} from "./pages/minecraft.js";
import {
    renderTwitch
} from "./pages/twitch.js";
import {
    getToken,
    setToken,
    clearToken,
    getGuildId,
    setGuildId,
    apiFetch,
} from "./api.js";

const modal = document.getElementById("auth-modal");
const shell = document.getElementById("shell");
const errEl = document.getElementById("auth-error");

const pages = {
    home: renderHome,
    rules: renderRules,
    stats: renderStats,
    minecraft: renderMinecraft,
    twitch: renderTwitch,
};

const AUTH_ERRORS = {
    no_code: "Authentication was cancelled.",
    auth_failed: "Discord authentication failed.",
    no_access: "You don't have administrator access to any server with Esraniki.",
    server_error: "An internal error occurred. Please try again.",
};

function currentPage() {
    return location.hash.slice(1) || "home";
}

async function navigate() {
    const page = currentPage();
    document.querySelectorAll(".nav-link").forEach((el) => {
        el.classList.toggle("active", el.dataset.page === page);
    });
    const content = document.getElementById("content");
    await new Promise((resolve) => {
        content.style.transition = "opacity 0.15s ease, transform 0.15s ease";
        content.style.opacity = "0";
        content.style.transform = "translateY(-4px)";
        setTimeout(resolve, 150);
    });
    content.innerHTML = "";
    content.style.transition = "";
    content.style.opacity = "";
    content.style.transform = "";
    const render = pages[page] ?? pages.home;
    await render(content);
    content.style.animation = "none";
    void content.offsetWidth;
    content.style.animation = "";
    window.lucide?.createIcons({
        nodes: [document.getElementById("sidebar")]
    });
}

async function showApp() {
    modal.style.display = "none";
    shell.style.display = "flex";
    window.lucide?.createIcons();
    await loadBranding();
    navigate();
}

async function loadUser() {
    try {
        const res = await apiFetch("/api/me");
        if (!res.ok) return;
        const {
            username,
            avatar
        } = await res.json();
        const nameEl = document.getElementById("sidebar-user-name");
        const avatarEl = document.getElementById("sidebar-user-avatar");
        if (nameEl) nameEl.textContent = username;
        if (avatarEl && avatar) avatarEl.src = avatar;
    } catch {}
}

async function loadBranding() {
    await loadUser();
    try {
        const [statusRes, guildsRes] = await Promise.all([
            apiFetch("/api/status"),
            apiFetch("/api/guilds"),
        ]);

        if (statusRes.ok) {
            const {
                avatarURL,
                version
            } = await statusRes.json();
            if (avatarURL) {
                document.getElementById("sidebar-avatar").src = avatarURL;
                document.getElementById("favicon").href = avatarURL;
            }
            if (version) {
                const el = document.getElementById("sidebar-version");
                if (el) el.textContent = "v" + version;
            }
        }

        if (guildsRes.ok) {
            const guilds = await guildsRes.json();
            if (!getGuildId() || !guilds.find((g) => g.id === getGuildId())) {
                setGuildId(guilds[0]?.id ?? "");
            }
            renderGuildPicker(guilds);
        }
    } catch {}
}

function renderGuildPicker(guilds) {
    const current = guilds.find((g) => g.id === getGuildId()) ?? guilds[0];
    const iconEl = document.getElementById("guild-picker-icon");
    const nameEl = document.getElementById("guild-picker-name");
    const dropdown = document.getElementById("guild-picker-dropdown");
    const pickerBtn = document.getElementById("guild-picker-btn");

    function setIcon(g) {
        if (g?.iconURL) {
            iconEl.src = g.iconURL;
            iconEl.style.display = "block";
        } else {
            iconEl.style.display = "none";
        }
        nameEl.textContent = g?.name ?? "";
    }

    setIcon(current);

    dropdown.innerHTML = guilds
        .map(
            (g) => `
    <button class="guild-picker-item${g.id === getGuildId() ? " active" : ""}" data-id="${g.id}" type="button">
      ${g.iconURL ? `<img src="${g.iconURL}" alt="" class="guild-picker-item-icon" />` : `<span class="guild-picker-item-icon guild-picker-item-icon--empty"></span>`}
      <span>${g.name}</span>
    </button>
  `,
        )
        .join("");

    pickerBtn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("open");
    };

    dropdown.onclick = (e) => {
        const item = e.target.closest("[data-id]");
        if (!item) return;
        setGuildId(item.dataset.id);
        setIcon(guilds.find((g) => g.id === item.dataset.id));
        dropdown
            .querySelectorAll(".guild-picker-item")
            .forEach((el) =>
                el.classList.toggle("active", el.dataset.id === item.dataset.id),
            );
        dropdown.classList.remove("open");
        navigate();
    };

    document.addEventListener("click", () => dropdown.classList.remove("open"), {
        capture: true,
    });
}

document.getElementById("logout-btn").onclick = async () => {
    await apiFetch("/api/logout", {
        method: "POST"
    }).catch(() => null);
    clearToken();
};

window.addEventListener("hashchange", navigate);

// pick up session token from OAuth callback redirect
const urlParams = new URLSearchParams(location.search);
const sessionFromUrl = urlParams.get("s");
const errorFromUrl = urlParams.get("error");

if (sessionFromUrl) {
    setToken(sessionFromUrl);
    history.replaceState({}, "", "/");
}

if (errorFromUrl) {
    if (errEl) {
        errEl.textContent =
            AUTH_ERRORS[errorFromUrl] || "Login failed. Please try again.";
        errEl.style.display = "block";
    }
    history.replaceState({}, "", "/");
}

if (getToken()) {
    apiFetch("/api/me")
        .then((res) => {
            if (res.ok) return showApp();
            clearToken();
        })
        .catch(() => null);
}

fetch("/api/brand")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
        if (!data?.avatarURL) return;
        const img = document.getElementById("login-avatar");
        if (img) img.src = data.avatarURL;
    })
    .catch(() => null);
