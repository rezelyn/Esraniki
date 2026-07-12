import {
    apiFetch,
    clearToken,
    getGuildId,
    setGuildId
} from "../api.js";

function icon(name) {
    return `<i data-lucide="${name}" class="stat-icon"></i>`;
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const time = [];
    if (d) time.push(d + "d");
    if (h) time.push(h + "h");
    if (m) time.push(m + "m");
    if (s || !time.length) time.push(s + "s");
    return time.join(" ");
}

function cpuStatus(cpu) {
    if (cpu < 50) return ["good", "Good"];
    if (cpu < 75) return ["ok", "OK"];
    return ["bad", "High"];
}

function platformLabel(p) {
    const map = {
        linux: "Linux",
        win32: "Windows",
        darwin: "macOS",
        freebsd: "FreeBSD",
    };
    return map[p] ?? p;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function updateStats(d) {
    const [cpuClass, cpuLabel] = cpuStatus(d.cpu);
    const statusVal = document.getElementById("stat-status");
    if (statusVal) {
        statusVal.innerHTML = `<span class="status-dot ${cpuClass}"></span>${cpuLabel}`;
    }

    setText("stat-ping", d.ping != null ? d.ping + "ms" : "-");
    setText("stat-uptime", formatUptime(d.uptime));
    setText("stat-cpu", d.cpu + "%");
    setText("stat-memused", d.memUsed + "MB");
    setText("stat-memtotal", d.memTotal + "MB");

    const guilds = d.guilds ?? 0;
    const guildsEl = document.querySelector(".profile-guilds");
    if (guildsEl)
        guildsEl.textContent = guilds + " guild" + (guilds !== 1 ? "s" : "");
}

let pollTimer = null;

const TWEMOJI = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg";
const LANG_LABELS = {
    en_us: `<img src="${TWEMOJI}/1f1fa-1f1f8.svg" class="lang-flag" alt="🇺🇸" /> English`,
    fr_fr: `<img src="${TWEMOJI}/1f1eb-1f1f7.svg" class="lang-flag" alt="🇫🇷" /> French`,
};

export async function renderHome(container) {
    clearInterval(pollTimer);
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const [res, settingsRes, guildsRes] = await Promise.all([
        apiFetch("/api/status").catch(() => null),
        apiFetch("/api/settings?guild=" + getGuildId()).catch(() => null),
        apiFetch("/api/guilds").catch(() => null),
    ]);

    if (!res) {
        document.getElementById("home-body").innerHTML =
            `<p class="error-msg">Error 408 (Request Timeout)</p>`;
        return;
    }
    if (res.status === 401) {
        clearToken();
        return;
    }
    const d = await res.json();
    const settings = settingsRes?.ok ?
        await settingsRes.json() : {
            language: "en_us",
            supported: ["en_us", "fr_fr"],
            debug: false,
        };

    const guilds = guildsRes?.ok ? await guildsRes.json() : [];
    const currentGuild = guilds.find((g) => g.id === getGuildId()) ?? guilds[0];

    const bannerStyle = d.bannerURL ?
        `background-image: url('${d.bannerURL}')` :
        "";
    const guildCount = d.guilds ?? 0;
    const [cpuClass, cpuLabel] = cpuStatus(d.cpu);

    const langOptions = settings.supported
        .map(
            (l) =>
            `<button class="guild-picker-item lang-picker-item${l === settings.language ? " active" : ""}" data-lang="${l}" type="button">${LANG_LABELS[l] ?? l}</button>`,
        )
        .join("");

    document.getElementById("home-body").innerHTML = `
    <div class="home-layout">
      <div class="home-main">
        <div class="profile-card">
          <div class="profile-banner" style="${bannerStyle}"></div>
          <div class="profile-body">
            ${
              d.avatarURL
                ? `<img class="profile-avatar" src="${d.avatarURL}" alt="avatar" />`
                : `<div class="profile-avatar"></div>`
            }
            <div class="profile-meta">
              <div class="profile-name">${d.tag ?? "—"}</div>
              <div class="profile-guilds">${guildCount} guild${guildCount !== 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">${icon("activity")}Status</div><div class="stat-value" id="stat-status"><span class="status-dot ${cpuClass}"></span>${cpuLabel}</div></div>
          <div class="stat-card"><div class="stat-label">${icon("wifi")}Ping</div><div class="stat-value" id="stat-ping">${d.ping != null ? d.ping + "ms" : "-"}</div></div>
          <div class="stat-card"><div class="stat-label">${icon("clock")}Uptime</div><div class="stat-value" id="stat-uptime">${formatUptime(d.uptime)}</div></div>
          <div class="stat-card"><div class="stat-label">${icon("cpu")}CPU</div><div class="stat-value" id="stat-cpu">${d.cpu}%</div></div>
          <div class="stat-card"><div class="stat-label">${icon("hard-drive")}Memory used</div><div class="stat-value" id="stat-memused">${d.memUsed}MB</div></div>
          <div class="stat-card"><div class="stat-label">${icon("database")}Memory total</div><div class="stat-value" id="stat-memtotal">${d.memTotal}MB</div></div>
          <div class="stat-card"><div class="stat-label">${icon("box")}Node.js</div><div class="stat-value">${d.node}</div></div>
          <div class="stat-card"><div class="stat-label">${icon("message-circle")}discord.js</div><div class="stat-value">v${d.djs}</div></div>
          <div class="stat-card"><div class="stat-label">${icon("monitor")}Platform</div><div class="stat-value">${platformLabel(d.platform)}</div></div>
        </div>
      </div>

      <div class="settings-panel">
        <div class="settings-card">
          <div class="settings-card-title">
            <i data-lucide="settings-2"></i>Settings
            <span class="settings-saved" id="lang-saved"></span>
          </div>
          <label class="settings-label">Guild</label>
          <div class="guild-picker" id="home-guild-picker">
            <button class="guild-picker-btn" id="home-guild-picker-btn" type="button">
              ${currentGuild?.iconURL ? `<img src="${currentGuild.iconURL}" alt="" class="guild-picker-icon" id="home-guild-picker-icon" />` : `<span class="guild-picker-icon guild-picker-item-icon--empty" id="home-guild-picker-icon"></span>`}
              <span id="home-guild-picker-name">${currentGuild?.name ?? "—"}</span>
            </button>
            <div class="guild-picker-dropdown" id="home-guild-picker-dropdown">
              ${guilds.map((g) => `<button class="guild-picker-item home-guild-picker-item${g.id === getGuildId() ? " active" : ""}" data-id="${g.id}" type="button">${g.iconURL ? `<img src="${g.iconURL}" alt="" class="guild-picker-item-icon" />` : `<span class="guild-picker-item-icon guild-picker-item-icon--empty"></span>`}<span>${g.name}</span></button>`).join("")}
            </div>
          </div>
          <label class="settings-label">Language</label>
          <div class="guild-picker" id="lang-picker">
            <button class="guild-picker-btn" id="lang-picker-btn" type="button">
              <span id="lang-picker-name">${LANG_LABELS[settings.language] ?? settings.language}</span>
            </button>
            <div class="guild-picker-dropdown" id="lang-picker-dropdown">${langOptions}</div>
          </div>
        </div>
        <div class="settings-card" id="admins-card">
          <div class="settings-card-title">
            <i data-lucide="shield-check"></i>Administrators
          </div>
          <div class="admins-list" id="admins-list">
            <span class="admins-loading">Loading…</span>
          </div>
        </div>
      </div>
    </div>

    <div class="console-card">
      <div class="console-header">
        <div class="console-header-left">
          <i data-lucide="terminal"></i><span>Console</span>
        </div>
        <div class="console-header-right">
          <button class="console-debug-btn has-tooltip${settings.debug ? " active" : ""}" id="setting-debug" data-tooltip="Debug"><i data-lucide="bug"></i></button>
          <button class="console-clear-btn has-tooltip" id="console-clear" data-tooltip="Clear"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="console-body" id="console-body"></div>
    </div>
  `;

    window.lucide?.createIcons();

    const homeGuildBtn = document.getElementById("home-guild-picker-btn");
    const homeGuildDropdown = document.getElementById(
        "home-guild-picker-dropdown",
    );
    const homeGuildName = document.getElementById("home-guild-picker-name");
    const homeGuildIcon = document.getElementById("home-guild-picker-icon");

    homeGuildBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        homeGuildDropdown.classList.toggle("open");
    });

    homeGuildDropdown.addEventListener("click", (e) => {
        const item = e.target.closest(".home-guild-picker-item");
        if (!item) return;

        const id = item.dataset.id;
        const guild = guilds.find((g) => g.id === id);
        setGuildId(id);

        homeGuildName.textContent = guild?.name ?? "";

        if (guild?.iconURL) {
            homeGuildIcon.src = guild.iconURL;
            homeGuildIcon.style.display = "";
        } else {
            homeGuildIcon.style.display = "none";
        }

        homeGuildDropdown
            .querySelectorAll(".home-guild-picker-item")
            .forEach((el) => el.classList.toggle("active", el.dataset.id === id));
        homeGuildDropdown.classList.remove("open");

        const sidebarName = document.getElementById("guild-picker-name");
        const sidebarIcon = document.getElementById("guild-picker-icon");
        if (sidebarName) sidebarName.textContent = guild?.name ?? "";
        if (sidebarIcon && guild?.iconURL) sidebarIcon.src = guild.iconURL;
        document
            .querySelectorAll("#guild-picker-dropdown .guild-picker-item")
            .forEach((el) => el.classList.toggle("active", el.dataset.id === id));
        window.dispatchEvent(new Event("hashchange"));
    });

    const langBtn = document.getElementById("lang-picker-btn");
    const langDropdown = document.getElementById("lang-picker-dropdown");
    const langName = document.getElementById("lang-picker-name");

    langBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle("open");
    });

    document.addEventListener(
        "click",
        () => {
            langDropdown.classList.remove("open");
            homeGuildDropdown.classList.remove("open");
        }, {
            signal: AbortSignal.timeout(1e9),
        },
    );

    langDropdown.addEventListener("click", async (e) => {
        const item = e.target.closest(".lang-picker-item");
        if (!item) return;
        const lang = item.dataset.lang;
        langDropdown
            .querySelectorAll(".lang-picker-item")
            .forEach((el) => el.classList.toggle("active", el === item));
        langName.innerHTML = LANG_LABELS[lang] ?? lang;
        langDropdown.classList.remove("open");
        const r = await apiFetch("/api/settings?guild=" + getGuildId(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                language: lang,
            }),
        }).catch(() => null);
        const saved = document.getElementById("lang-saved");
        if (saved) {
            saved.textContent = r?.ok ? "✅ Saved" : "❌ Error";
            saved.className = "settings-saved " + (r?.ok ? "ok" : "err");
            setTimeout(() => {
                saved.textContent = "";
                saved.className = "settings-saved";
            }, 2000);
        }
    });

    const debugCheck = document.getElementById("setting-debug");
    debugCheck.addEventListener("click", async () => {
        const active = debugCheck.classList.toggle("active");
        await apiFetch("/api/settings?guild=" + getGuildId(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                debug: active,
            }),
        }).catch(() => null);
    });

    apiFetch("/api/admins?guild=" + getGuildId())
        .then((r) => (r.ok ? r.json() : []))
        .then((admins) => {
            const list = document.getElementById("admins-list");
            if (!list) return;
            if (!admins.length) {
                list.innerHTML = `<span class="admins-loading">No admins found.</span>`;
                return;
            }
            list.innerHTML = admins
                .map(
                    (a) => `
        <div class="admins-item">
          <img class="admins-avatar" src="${a.avatarURL}" alt="" />
          <span class="admins-name">${a.displayName}</span>
        </div>
      `,
                )
                .join("");
        })
        .catch(() => {
            const list = document.getElementById("admins-list");
            if (list)
                list.innerHTML = `<span class="admins-loading">Failed to load.</span>`;
        });

    let lastLogId = 0;

    async function pollLogs() {
        if (!document.getElementById("console-body")) return;
        const r = await apiFetch("/api/logs?since=" + lastLogId).catch(() => null);
        if (!r || r.status === 401) return;
        const entries = await r.json();
        if (!entries.length) return;
        lastLogId = entries[entries.length - 1].id;
        const body = document.getElementById("console-body");
        if (!body) return;
        const wasAtBottom =
            body.scrollHeight - body.scrollTop - body.clientHeight < 8;
        for (const e of entries) {
            const line = document.createElement("div");
            line.className = `console-line console-${e.level}`;
            const t = new Date(e.time);
            const ts =
                String(t.getHours()).padStart(2, "0") +
                ":" +
                String(t.getMinutes()).padStart(2, "0") +
                ":" +
                String(t.getSeconds()).padStart(2, "0");
            line.innerHTML = `<span class="console-ts">${ts}</span><span class="console-level">${e.level.toUpperCase()}</span><span class="console-msg">${escHtml(e.message)}</span>`;
            body.appendChild(line);
        }
        if (wasAtBottom) body.scrollTop = body.scrollHeight;
    }

    function escHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    pollLogs();

    document.getElementById("console-clear").onclick = () => {
        const body = document.getElementById("console-body");
        if (body) body.innerHTML = "";
    };

    pollTimer = setInterval(async () => {
        if (!document.getElementById("stat-uptime")) {
            clearInterval(pollTimer);
            return;
        }
        const [r] = await Promise.all([
            apiFetch("/api/status").catch(() => null),
            pollLogs(),
        ]);
        if (!r || r.status === 401) {
            clearInterval(pollTimer);
            if (r?.status === 401) clearToken();
            return;
        }
        updateStats(await r.json());
    }, 1000);
}
