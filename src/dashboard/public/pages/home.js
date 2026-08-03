import { apiFetch, clearToken, getGuildId, setGuildId } from "../backend/api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon, timestamp, LANG_FLAGS } from "../shared/style.js";

// TODO: fetch repo url directly from package.json
const REPOSITORY_URL = "https://github.com/rezelyn/Esraniki";
const BUGS_URL = `${REPOSITORY_URL}/issues`;
const FUNDING_URL = "https://patreon.com/rezelyn";

function cpuStatus(cpu) {
    if (cpu < 25) return ["good", "Good"];
    if (cpu < 50) return ["ok", "OK"];
    return ["bad", "High"];
}

function platformLabel(platform) {
    const map = {
        aix: "IBM AIX",
        android: "Android",
        darwin: "macOS",
        freebsd: "FreeBSD",
        linux: "Linux",
        openbsd: "OpenBSD",
        sunos: "SunOS",
        win32: "Windows"
    };
    return map[platform] ?? platform;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function updateStats(value) {
    const [cpuClass, cpuLabel] = cpuStatus(value.cpu);
    const status = document.getElementById("status-value");
    if (status) {
        status.innerHTML = `<span class="status-dot ${cpuClass}"></span>${cpuLabel}`;
    }

    setText("latency-value", value.ping != null ? value.ping + "ms" : "-1ms");
    setText("uptime-value", timestamp(value.uptime));
    setText("cpu-value", value.cpu + "%");
    setText("memory-value", value.memUsed + "MB" + "/" + value.memTotal + "MB");

    const guilds = value.guilds ?? 0;
    const element = document.querySelector(".profile-guilds");
    if (element) element.textContent = guilds + " guild" + (guilds !== 1 ? "s" : "");
}

let pollTimer = null;

const timezoneMap = {
    14: "Kiritimati",
    13: "Nuku'alofa",
    12: "Auckland, Fiji",
    11: "Nouma, Solomon Islands",
    10: "Sydney, Guam",
    9: "Tokyo, Seoul",
    8: "Beijing, Singapore",
    7: "Bangkok, Jakarta",
    6: "Dhaka, Almaty",
    5: "Karachi, Tashkent",
    4: "Dubai, Baku",
    3: "Moscow, Nairobi",
    2: "Cairo, Athens",
    1: "Berlin, Paris",
    0: "London, Lisbon",
    "-1": "Azores, Cape Verde",
    "-2": "South Georgia",
    "-3": "Buenos Aires, Sao Paulo",
    "-4": "Santiago, Halifax",
    "-5": "New York, Bogota",
    "-6": "Chicago, Mexico City",
    "-7": "Denver, Phoenix",
    "-8": "Los Angeles, Vancouver",
    "-9": "Anchorage, Gambier Islands",
    "-10": "Honolulu, Papeete",
    "-11": "Pago Pago, Midway Atoll",
    "-12": "Baker Island",
};

const TIMEZONE_OPTIONS = Object.entries(timezoneMap).map(
    ([offsetKey, cities]) => {
        const offset = Number(offsetKey);
        const sign = offset >= 0 ? "+" : "";
        const value = `UTC${sign}${offset}`;

        return {
            value,
            label: `(${value}) ${cities}`,
        };
    }
);

let settingsStatusTimer = null;

function showSettingsStatus(message, type) {
    const element = document.getElementById("home-settings-status");
    if (!element) return;
    element.textContent = message;
    element.className = "status " + type;
    element.style.display = "inline";
    element.classList.remove("hiding");
    clearTimeout(settingsStatusTimer);
    settingsStatusTimer = setTimeout(() => {
        element.classList.add("hiding");
        element.addEventListener("animationend", () => {
            element.style.display = "none";
        }, { once: true });
    }, 3000);
}

export async function renderHome(container) {
    clearInterval(pollTimer);
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const [resolve, settingsResolve, guildsResolve] = await Promise.all([
        apiFetch("/api/status").catch(() => null),
        apiFetch("/api/settings?guild=" + getGuildId()).catch(() => null),
        apiFetch("/api/guilds").catch(() => null),
    ]);

    if (!resolve) {
        document.getElementById("home-body").innerHTML =
            `<p class="error-msg">${lucideIcon("globe-x", "icon")} Error 408 (Request Timeout)</p>`;
        return;
    }

    if (resolve.status === 401) {
        clearToken();
        return;
    }

    const app = await resolve.json();
    const settings = settingsResolve?.ok ? await settingsResolve.json() : {
        language: "en_us",
        supported: ["en_us", "fr_fr"],
        debug: false
    };

    const guilds = guildsResolve?.ok ? await guildsResolve.json() : [];
    const currentGuild = guilds.find((guild) => guild.id === getGuildId()) ?? guilds[0];
    const appBanner = app.bannerURL ? `background-image: url('${app.bannerURL}')` : "";
    const guildCount = app.guilds ?? 0;
    const [cpuClass, cpuLabel] = cpuStatus(app.cpu);

    const guildOptions = guilds.map((guild) => ({
        value: guild.id,
        label: guild.name,
        iconURL: guild.iconURL
    }));

    const languageOptions = settings.supported.map((language) => ({
        value: language,
        label: language,
        html: LANG_FLAGS[language] ?? language
    }));

    const timezoneOptions = TIMEZONE_OPTIONS.map((timezone) => ({
        value: timezone.value,
        label: timezone.label
    }));

    document.getElementById("home-body").innerHTML = `
            <div class="home-layout">
            <div class="home-left">
                <div class="card profile-card">
                    <div class="profile-banner" style="${appBanner}"></div>
        
                    <div class="profile-body">
                        ${ app.avatarURL ? `<img class="profile-avatar" src="${app.avatarURL}" alt="avatar" />` : `
                        <div class="profile-avatar"></div>` }
        
                        <div class="profile-meta">
                            <div class="profile-name">${app.tag}</div>
                            <div class="profile-guilds">
                                ${guildCount} guild${guildCount !== 1 ? "s" : ""}
                            </div>
                        </div>
        
                        <div class="profile-actions">
                            <a class="btn small tooltip" href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" tooltip="GitHub repository">
                                <!-- GitHub icon -->
                                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                    <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                                </svg>
                            </a>

                            <a class="btn small tooltip" href="${BUGS_URL}" target="_blank" rel="noopener noreferrer" tooltip="Report an issue">
                                ${lucideIcon("circle-dot", "icon")}
                            </a>
                            
                            <a class="btn small tooltip" href="${FUNDING_URL}" target="_blank" rel="noopener noreferrer" tooltip="Support">
                                ${lucideIcon("hand-heart", "icon")}
                            </a>
                        </div>
                    </div>
                </div>
        
                <div class="monitoring-grid">
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("activity", "icon")} Status</label>
                        <label class="label-text" id="status-value">
                            <span class="status-dot ${cpuClass}"></span>${cpuLabel}
                        </label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("wifi", "icon")} Latency</label>
                        <label class="label-text" id="latency-value">${app.ping != null ? app.ping + "ms" : "-1ms"}</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("clock", "icon")} Uptime</label>
                        <label class="label-text" id="uptime-value">${timestamp(app.uptime)}</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("cpu", "icon")} CPU</label>
                        <label class="label-text" id="cpu-value">${app.cpu}%</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("memory-stick", "icon")} Memory</label>
                        <label class="label-text" id="memory-value">${app.memUsed}MB/${app.memTotal}MB</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("timeline", "icon")} Shards</label>
                        <label class="label-text" id="shards-value">-</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("package", "icon")} Node.js</label>
                        <label class="label-text">${app.node}</label>
                    </div>
        
                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("package", "icon")} discord.js</label>
                        <label class="label-text">v${app.djs}</label>
                    </div>

                    <div class="card monitoring-card" type="secondary">
                        <label class="label-header">${lucideIcon("monitor", "icon")} Platform</label>
                        <label class="label-text">${platformLabel(app.platform)}</label>
                    </div>
                </div>
        
                <div class="card console-card">
                    <div class="card-header">
                        <div class="console-header-left">
                            <label class="label-header">${lucideIcon("terminal")} Console</label>
                        </div>
        
                        <div class="console-header-right">
                            <button class="btn xs tooltip${settings.debug ? " active " : " "}" id="setting-debug" tooltip="Debug">
                                ${lucideIcon("bug")}
                            </button>
                            <button class="btn xs tooltip" id="console-clear" tooltip="Clear">
                                ${lucideIcon("trash")}
                            </button>
                        </div>
                    </div>
        
                    <div class="console-body" id="console-body"></div>
                </div>
            </div>
        
            <div class="home-right">
                <div class="card settings-card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("settings-2", "icon")} Settings</label>
                        <span id="home-settings-status" class="status" style="display:none"></span>
                    </div>
                    <div class="card-body">
                        <div class="card-field">
                            <label class="label-option">Guild</label>
                            ${dropdownTemplate({ id: "home-guild-picker", options: guildOptions, selectedValue: currentGuild?.id, ariaLabel: "Select a server", className: "settings-dropdown" })}
                        </div>

                        <div class="card-field">
                            <label class="label-option">Language</label>
                            ${dropdownTemplate({ id: "lang-picker", options: languageOptions, selectedValue: settings.language, ariaLabel: "Select a language", className: "settings-dropdown" })}
                        </div>

                        <div class="card-field">
                            <label class="label-option">Timezone</label>
                            ${dropdownTemplate({ id: "timezone-picker", options: timezoneOptions, selectedValue: settings.timezone, ariaLabel: "Select a timezone", className: "settings-dropdown" })}
                            <div class="settings-check-row" id="24h-option">
                                <input type="checkbox" id="24h-checkbox" ${settings.use24h ? "checked" : ""} />
                                <div class="label-checkbox">
                                    24h format
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card admins-card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("shield-user", "icon")} Administrators</label>
                    </div>
                    <div class="card-body">
                        <div class="card-field">
                            <div class="admins-list" id="admins-list">
                                <div class="spinner alt"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    initializeDropdown(
        document.getElementById("home-guild-picker"),
        guildOptions,
        (option) => {
            setGuildId(option.value);
            window.dispatchEvent(new Event("hashchange"));
        }
    );

    initializeDropdown(
        document.getElementById("lang-picker"),
        languageOptions,
        async (option) => {
            const response = await apiFetch("/api/settings?guild=" + getGuildId(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ language: option.value })
            }).catch(() => null);
        
            showSettingsStatus(response?.ok ? "Saved" : "Error", response?.ok ? "success" : "error");
        }
    );
    
    initializeDropdown(
        document.getElementById("timezone-picker"),
        timezoneOptions,
        async (option) => {
            const response = await apiFetch("/api/settings?guild=" + getGuildId(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ timezone: option.value })
            }).catch(() => null);
            showSettingsStatus(response?.ok ? "Saved" : "Error", response?.ok ? "success" : "error");
        }
    );
    
    const militaryTime = document.getElementById("24h-checkbox");
    militaryTime?.addEventListener("change", async () => {
        const response = await apiFetch("/api/settings?guild=" + getGuildId(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ use24h: militaryTime.checked })
        }).catch(() => null);
        showSettingsStatus(response?.ok ? "Saved" : "Error", response?.ok ? "success" : "error");
    });

    const debugMode = document.getElementById("setting-debug");
    debugMode.addEventListener("click", async () => {
        const active = debugMode.classList.toggle("active");
        const response = await apiFetch("/api/settings?guild=" + getGuildId(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ debug: active })
        }).catch(() => null);
        showSettingsStatus(response?.ok ? "Saved" : "Error", response?.ok ? "success" : "error");
    });

    let adminsRequestId = 0;
    async function loadAdmins() {
        const list = document.getElementById("admins-list");
        if (!list) return;

        const requestId = ++adminsRequestId;
        const guild = getGuildId();

        try {
            const response = await apiFetch("/api/admins?guild=" + guild);

            if (requestId !== adminsRequestId) return;

            if (response.status === 401) {
                clearToken();
                return;
            }
            if (!response.ok) {
                throw new Error("admins request failed: " + response.status);
            }

            const admins = await response.json();
            const currentList = document.getElementById("admins-list");
            if (!currentList) return;

            if (!admins.length) {
                currentList.innerHTML = `<span class="admins-loading">No admins found.</span>`;
                return;
            }

            currentList.innerHTML = admins
                .map(
                    (admin) => `
                        <div class="admins-user">
                            <img class="admins-avatar" src="${admin.avatarURL}" alt="" />
                            <span class="admins-name">${admin.displayName}</span>
                        </div>
                    `,
                )
                .join("");
        } catch {
            if (requestId !== adminsRequestId) return;
            const currentList = document.getElementById("admins-list");
            if (currentList)
                currentList.innerHTML = `<span class="admins-loading">Failed to load.</span>`;
        }
    }

    loadAdmins();

    let lastLogId = 0;
    async function pollLogs() {
        if (!document.getElementById("console-body")) return;

        const response = await apiFetch("/api/logs?since=" + lastLogId).catch(() => null);
        if (!response || response.status === 401) return;

        const entries = await response.json();
        if (!entries.length) return;

        lastLogId = entries[entries.length - 1].id;

        const body = document.getElementById("console-body");
        if (!body) return;

        const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 8;

        for (const entry of entries) {
            const time = new Date(entry.time);
            const timestamp =
                String(time.getHours()).padStart(2, "0") +
                ":" +
                String(time.getMinutes()).padStart(2, "0") +
                ":" +
                String(time.getSeconds()).padStart(2, "0");

            const line = document.createElement("div");
            line.className = `console-line console-${entry.level}`;
            line.innerHTML = `
                <span class="console-timestamp">${timestamp}</span>
                <span class="console-level">${entry.level.toUpperCase()}</span>
                <span class="console-output">${decodeHtml(entry.message)}</span>
            `;

            body.appendChild(line);
        }
        
        if (atBottom) body.scrollTop = body.scrollHeight;
    }

    pollLogs();

    document.getElementById("console-clear").onclick = () => {
        const body = document.getElementById("console-body");
        if (body) body.innerHTML = "";
    };

    pollTimer = setInterval(async () => {
        if (!document.getElementById("uptime-value")) {
            clearInterval(pollTimer);
            return;
        }
        const [response] = await Promise.all([
            apiFetch("/api/status").catch(() => null),
            pollLogs(),
        ]);
        if (!response || response.status === 401) {
            clearInterval(pollTimer);
            if (response?.status === 401) clearToken();
            return;
        }
        updateStats(await response.json());
    }, 1000);
}
