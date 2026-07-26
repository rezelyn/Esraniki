import { apiFetch, clearToken, getGuildId, setGuildId } from "../api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon, timestamp, LANG_FLAGS } from "../shared/style.js";

// TODO: fetch repo url directly from package.json
const GITHUB_REPO_URL = "https://github.com/Rezelyn/esraniki";
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
const FUNDING_URL = "https://patreon.com/rezelyn"

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
	setText("stat-uptime", timestamp(d.uptime));
	setText("stat-cpu", d.cpu + "%");
	setText("stat-memused", d.memUsed + "MB");
	setText("stat-memtotal", d.memTotal + "MB");

	const guilds = d.guilds ?? 0;
	const guildsEl = document.querySelector(".profile-guilds");
	if (guildsEl)
		guildsEl.textContent = guilds + " guild" + (guilds !== 1 ? "s" : "");
}

let pollTimer = null;

const TIMEZONE_CITIES = {
	"-12": "Baker Island",
	"-11": "Pago Pago, Midway Atoll",
	"-10": "Honolulu, Papeete",
	"-9": "Anchorage, Gambier Islands",
	"-8": "Los Angeles, Vancouver",
	"-7": "Denver, Phoenix",
	"-6": "Chicago, Mexico City",
	"-5": "New York, Bogota",
	"-4": "Santiago, Halifax",
	"-3": "Buenos Aires, Sao Paulo",
	"-2": "South Georgia",
	"-1": "Azores, Cape Verde",
	0: "London, Lisbon",
	1: "Berlin, Paris",
	2: "Cairo, Athens",
	3: "Moscow, Nairobi",
	4: "Dubai, Baku",
	5: "Karachi, Tashkent",
	6: "Dhaka, Almaty",
	7: "Bangkok, Jakarta",
	8: "Beijing, Singapore",
	9: "Tokyo, Seoul",
	10: "Sydney, Guam",
	11: "Nouma, Solomon Islands",
	12: "Auckland, Fiji",
	13: "Nuku'alofa",
	14: "Kiritimati",
};

const TIMEZONE_OPTIONS = Array.from(
	{
		length: 27,
	},
	(_, i) => {
		const offset = i - 12;
		const sign = offset >= 0 ? "+" : "-";
		const value = `UTC${sign}${Math.abs(offset)}`;
		const cities = TIMEZONE_CITIES[String(offset)];
		return {
			value,
			label: cities ? `${value} - ${cities}` : value,
		};
	},
);

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
	const app = await res.json();
	const settings = settingsRes?.ok
		? await settingsRes.json()
		: {
				language: "en_us",
				supported: ["en_us", "fr_fr"],
				debug: false,
			};

	const guilds = guildsRes?.ok ? await guildsRes.json() : [];
	const currentGuild = guilds.find((g) => g.id === getGuildId()) ?? guilds[0];
	const appBanner = app.bannerURL
		? `background-image: url('${app.bannerURL}')`
		: "";
	const guildCount = app.guilds ?? 0;
	const [cpuClass, cpuLabel] = cpuStatus(app.cpu);

	const guildOptions = guilds.map((guild) => ({
		value: guild.id,
		label: guild.name,
		iconURL: guild.iconURL,
	}));
	const languageOptions = settings.supported.map((language) => ({
		value: language,
		label: language,
		html: LANG_FLAGS[language] ?? language,
	}));
	const timezoneOptions = TIMEZONE_OPTIONS.map((timezone) => ({
		value: timezone.value,
		label: timezone.label,
	}));

	document.getElementById("home-body").innerHTML = `
    <div class="home-layout">
      <div class="home-main">
        <div class="profile-card">
          <div class="profile-banner" style="${appBanner}"></div>

          <div class="profile-body">
            ${
				app.avatarURL
					? `<img class="profile-avatar" src="${app.avatarURL}" alt="avatar" />`
					: `<div class="profile-avatar"></div>`
			}

            <div class="profile-meta">
              <div class="profile-name">${app.tag}</div>
              <div class="profile-guilds">
                ${guildCount} guild${guildCount !== 1 ? "s" : ""}
              </div>
            </div>

            <div class="profile-actions">
              <a
                class="btn-action has-tooltip"
                href="${GITHUB_REPO_URL}"
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip="GitHub repository"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
              </a>
              <a
                class="btn-action has-tooltip"
                href="${GITHUB_ISSUES_URL}"
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip="Report an issue"
              >
                <i data-lucide="circle-dot"></i>
              </a>
              </a>
              <a
                class="btn-action has-tooltip"
                href="${FUNDING_URL}"
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip="Support"
              >
                <i data-lucide="hand-heart"></i>
              </a>
            </div>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">${lucideIcon("activity")}Status</div>
            <div class="stat-value" id="stat-status">
              <span class="status-dot ${cpuClass}"></span>${cpuLabel}
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("wifi")}Latency</div>
            <div class="stat-value" id="stat-ping">
              ${app.ping != null ? app.ping + "ms" : "-"}
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("clock")}Uptime</div>
            <div class="stat-value" id="stat-uptime">
              ${timestamp(app.uptime)}
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("cpu")}CPU</div>
            <div class="stat-value" id="stat-cpu">${app.cpu}%</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("hard-drive")}Memory used</div>
            <div class="stat-value" id="stat-memused">${app.memUsed}MB</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("database")}Memory total</div>
            <div class="stat-value" id="stat-memtotal">${app.memTotal}MB</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("box")}Node.js</div>
            <div class="stat-value">${app.node}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("message-circle")}discord.js</div>
            <div class="stat-value">v${app.djs}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">${lucideIcon("monitor")}Platform</div>
            <div class="stat-value">${platformLabel(app.platform)}</div>
          </div>
        </div>

        <div class="console-card">
          <div class="console-header">
            <div class="console-header-left">
              ${lucideIcon("terminal")}
              <span>Console</span>
            </div>

            <div class="console-header-right">
              <button
                class="btn-action has-tooltip${
					settings.debug ? " active" : ""
				}"
                id="setting-debug"
                data-tooltip="Debug"
              >
                ${lucideIcon("bug")}
              </button>

              <button
                class="btn-action has-tooltip"
                id="console-clear"
                data-tooltip="Clear"
              >
                ${lucideIcon("trash")}
              </button>
            </div>
          </div>

          <div class="console-body" id="console-body"></div>
        </div>
      </div>

      <div class="settings-panel">
        <div class="settings-card">
          <div class="settings-card-title">
            ${lucideIcon("settings-2")} Settings
            <span class="settings-saved" id="lang-saved"></span>
          </div>

          <label class="settings-label">Guild</label>

          ${dropdownTemplate({ id: "home-guild-picker", options: guildOptions, selectedValue: currentGuild?.id, ariaLabel: "Select a server", className: "settings-dropdown" })}

          <label class="settings-label">Language</label>

          ${dropdownTemplate({ id: "lang-picker", options: languageOptions, selectedValue: settings.language, ariaLabel: "Select a language", className: "settings-dropdown" })}

          <label class="settings-label">Timezone</label>

          ${dropdownTemplate({ id: "timezone-picker", options: timezoneOptions, selectedValue: settings.timezone ?? "UTC+0", ariaLabel: "Select a timezone", className: "settings-dropdown" })}

          <div class="settings-check-row" id="24h-option">
            <input
              type="checkbox"
              id="24h-checkbox"
              ${settings.use24h ? "checked" : ""}
            />

            <div class="label-checkbox">
              24h format
            </div>
          </div>
        </div>

        <div class="settings-card" id="admins-card">
          <div class="settings-card-title">
            ${lucideIcon("shield-check")} Administrators
          </div>

          <div class="admins-list" id="admins-list">
            <span class="admins-loading">Loading...</span>
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
		},
	);

	initializeDropdown(
		document.getElementById("lang-picker"),
		languageOptions,
		async (option) => {
			const r = await apiFetch("/api/settings?guild=" + getGuildId(), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					language: option.value,
				}),
			}).catch(() => null);
			const saved = document.getElementById("lang-saved");
			if (saved) {
				saved.textContent = r?.ok ? "Saved" : "Error";
				saved.className = "settings-saved " + (r?.ok ? "ok" : "err");
				setTimeout(() => {
					saved.textContent = "";
					saved.className = "settings-saved";
				}, 2000);
			}
		},
	);

	initializeDropdown(
		document.getElementById("timezone-picker"),
		timezoneOptions,
		async (option) => {
			await apiFetch("/api/settings?guild=" + getGuildId(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ timezone: option.value }),
			}).catch(() => null);
		},
	);

	const cb24h = document.getElementById("24h-checkbox");
	if (cb24h) {
		cb24h.addEventListener("change", async () => {
			await apiFetch("/api/settings?guild=" + getGuildId(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ use24h: cb24h.checked }),
			}).catch(() => null);
		});
	}

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
        <div class="admins-user">
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
		const r = await apiFetch("/api/logs?since=" + lastLogId).catch(
			() => null,
		);
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
			line.innerHTML = `<span class="console-ts">${ts}</span><span class="console-level">${e.level.toUpperCase()}</span><span class="console-msg">${decodeHtml(e.message)}</span>`;
			body.appendChild(line);
		}
		if (wasAtBottom) body.scrollTop = body.scrollHeight;
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
