import { apiFetch, clearToken, getGuildId } from "../api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let refreshTimer = null;
let countdownTimer = null;

export async function renderMinecraft(container) {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
    container.innerHTML = `<div class="spinner"></div>`;

    const guild = getGuildId();
    const [resolveState, resolveChannels] = await Promise.all([
        apiFetch("/api/minecraft?guild=" + guild).catch(() => null),
        apiFetch("/api/channels?guild=" + guild).catch(() => null),
    ]);

    if (resolveState?.status === 401) {
        clearToken();
        return;
    }

    const state = resolveState?.ok ? 
        await resolveState.json() : { tracking: false };
    const channels = resolveChannels?.ok ? 
        await resolveChannels.json() : [];

    const channelOptions = [
        { value: "", label: "Select a channel" },
        ...channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}`,
        })),
    ];

    container.innerHTML = `
        <div class="minecraft-layout">
            <div class="minecraft-left">
                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("message-square", "icon")} Channel</label>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Discord Channel</label>
                            ${dropdownTemplate({ id: "mc-channel", options: channelOptions, selectedValue: state.channelId ?? "", ariaLabel: "Select a Discord channel", className: "dropdown-menu--field" })}
                        </div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("server", "icon")} Server Informations</label>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Server Name</label>
                            <input type="text" id="mc-name" placeholder="My Server" value="${decodeHtml(state.name ?? " ")}" />
                        </div>
                        <div class="field">
                            <label class="label-option">Server IP</label>
                            <input type="text" id="mc-ip" placeholder="play.example.com" value="${decodeHtml(state.server ?? " ")}" />
                        </div>
                        <p class="label-hint">The bot will post and update a status embed every minutes in the selected channel.</p>
                    </div>
                </div>

                <div class="actions" style="margin-top: 0.75rem;">
                    <span id="mc-status" class="status" style="display:none"></span>
                        ${state.tracking ? `<button class="btn-action has-tooltip" id="mc-untrack-btn" data-tooltip="Stop tracking">${lucideIcon("square")}</button>` : ""}
                        ${state.tracking ? `<button class="btn-action has-tooltip" id="mc-refresh-btn" data-tooltip="Force refresh">${lucideIcon("refresh-cw")}</button>` : ""}
                    
                    <button class="btn btn-accent" id="mc-track-btn">
                        ${state.tracking ? "Save changes": "Start tracking"}
                    </button>
                </div>
            </div>
                    
            <div class="minecraft-right">
                <div class="card" id="mc-preview-card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("square-activity", "icon")} Server Status</label>
                    </div>
                    <div class="card-body" id="mc-preview">
                        ${state.tracking ? `<div class="spinner"></div>` : `<p class="label-hint" style="margin:0">No server is being tracked.</p>`}
                    </div>
                </div>

                <div class="card" id="mc-players-card" style="margin-top: 1rem; ${state.tracking ? " " : "display:none "}">
                    <div class="card-header">
                        <label class="label-header" id="mc-players-title">${lucideIcon("user", "icon")} Connected Players</label>
                    </div>

                    <div class="card-body" id="mc-players-body">
                        <div class="spinner"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const channelDropdown = initializeDropdown(
        document.getElementById("mc-channel"),
        channelOptions,
    );

    if (state.tracking) loadPreview();

    function showStatus(message, type) {
        const element = document.getElementById("mc-status");
        if (!element) return;
        element.textContent = message;
        element.className = "status " + type;
        element.style.display = "inline-block";
        element.classList.remove("hiding");
        setTimeout(() => {
            element.classList.add("hiding");
            element.addEventListener(
                "animationend",
                () => {
                    element.style.display = "none";
                },
                {
                    once: true,
                },
            );
        }, 3000);
    }

    async function loadPreview() {
        const preview = document.getElementById("mc-preview");
        if (!preview) return;
        const response = await apiFetch("/api/minecraft/status?guild=" + guild).catch(
            () => null,
        );
        if (!response) {
            preview.innerHTML = `<p class="label-hint" style="margin:0">Failed to fetch server status.</p>`;
            return;
        }
        if (response.status === 401) {
            clearToken();
            return;
        }
        const data = response.ok ? await response.json() : null;
        if (!data) {
            preview.innerHTML = `<p class="label-hint" style="margin:0">No data available.</p>`;
            return;
        }
        renderPreview(preview, data);
        renderPlayers(data);
    }

    function renderPreview(element, data) {
        // TODO: remove and replace the text status color constant with a "status-dot" instead (like in src/dashboard/public/pages/home.js)
        const statusColor = data.online ? "var(--green)" : "var(--red)";
        const iconUrl = `https://api.mcsrvstat.us/icon/${encodeURIComponent(state.server)}`;

        element.innerHTML = `
            <div class="mc-preview-top">
                <div class="mc-status-grid">
                    <div class="mc-stat-card" type="secondary">
                        <label class="label-header">${lucideIcon("activity", "icon")} Status</label>
                        <label class="label-text" style="color:${statusColor}">${data.online ? "Online" : "Offline"}</label>
                    </div>
                    <div class="mc-stat-card" type="secondary">
                        <label class="label-header">${lucideIcon("users", "icon")} Players</label>
                        <label class="label-text">${data.players?.online ?? 0} / ${data.players?.max ?? 0}</label>
                    </div>
                    <div class="mc-stat-card" type="secondary">
                        <label class="label-header">${lucideIcon("puzzle", "icon")} Version</label>
                        <label class="label-text id="mc-version">${decodeHtml(data.version ?? "Unknown")}</label>
                    </div>
                </div>
                <img class="mc-server-icon" src="${decodeHtml(iconUrl)}" alt="" onerror="this.style.display='none'" />
            </div>
            ${data.motd ? `<div class="mc-motd">${decodeHtml(data.motd)}</div>` : ""}
        `;
    }

    function renderPlayers(data) {
        const card = document.getElementById("mc-players-card");
        const body = document.getElementById("mc-players-body");
        if (!card || !body) return;

        const list = data.players?.list ?? [];
        const count = data.players?.online ?? 0;
        card.style.display = "";

        if (list.length === 0) {
            body.innerHTML = `<p class="label-hint" style="margin:0">${data.online ? "No players connected." : "Server is offline."}</p>`;
            return;
        }

        body.innerHTML = list
            .map((player) => {
                const name = player.name ?? player;
                const identifier = player.uuid ?? name;
                const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(identifier)}/32`;
                return `
                    <div class="mc-player-row">
                        <img class="mc-player-avatar" src="${decodeHtml(avatarUrl)}" alt="${decodeHtml(name)}" onerror="this.src='https://mc-heads.net/avatar/steve/32'" />
                        <span class="mc-player-name">${decodeHtml(name)}</span>
                    </div>
                `;
            })
            .join("");
    }

    document.getElementById("mc-track-btn").onclick = async () => {
        const ip = document.getElementById("mc-ip").value.trim();
        const name = document.getElementById("mc-name").value.trim() || ip;
        const channelId = channelDropdown?.getSelectedValue() ?? "";
        if (!ip) {
            showStatus("Enter a server IP", "error");
            return;
        }
        if (!channelId) {
            showStatus("Select a channel", "error");
            return;
        }

        const response = await apiFetch("/api/minecraft/track?guild=" + guild, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ip,
                name,
                channelId,
            }),
        }).catch(() => null);

        if (response?.ok) {
            showStatus("Tracking started", "success");
            setTimeout(() => renderMinecraft(container), 1200);
        } else {
            const err = response ? await response.json().catch(() => ({})) : {};
            showStatus(err.error || "Failed to start tracking", "error");
        }
    };

    const untrackBtn = document.getElementById("mc-untrack-btn");
    if (untrackBtn) {
        untrackBtn.onclick = async () => {
            if (!confirm("Stop tracking this server?")) return;
            const response = await apiFetch("/api/minecraft/untrack?guild=" + guild, {
                method: "POST",
            }).catch(() => null);
            if (response?.ok) renderMinecraft(container);
            else showStatus("Failed to stop tracking", "error");
        };
    }

    const refreshBtn = document.getElementById("mc-refresh-btn");
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            const response = await apiFetch("/api/minecraft/refresh?guild=" + guild, {
                method: "POST",
            }).catch(() => null);
            if (response?.ok) {
                showStatus("Refreshed", "success");
                const body = await response.json();
                const preview = document.getElementById("mc-preview");
                if (preview && body.data) {
                    renderPreview(preview, body.data);
                    renderPlayers(body.data);
                    startCountdown(30);
                }
            } else {
                showStatus("Refresh failed", "error");
            }
        };
    }

    if (state.tracking) {
        refreshTimer = setInterval(() => {
            if (!document.getElementById("mc-preview")) {
                clearInterval(refreshTimer);
                clearInterval(countdownTimer);
                return;
            }
            loadPreview();
        }, 30000);
    }
}
