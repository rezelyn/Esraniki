import { apiFetch, clearToken, getGuildId } from "../backend/api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let container = null;
let channelDropdown = null;
let statusTimer = null;
let leaderboardTimer = null;

let cachedLeaderboard = [];
let currentMode = "total";
let currentPage = 1;
const maxRow = 10;

function showStatus(message, type) {
    const element = document.getElementById("shrimp-status");
    if (!element) return;

    element.textContent = message;
    element.className = "status " + type;
    element.style.display = "inline-block";
    element.classList.remove("hiding");

    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        element.classList.add("hiding");
        element.addEventListener("animationend", () => {
            element.style.display = "none";
        }, { once: true });
    }, 3000);
}

function passesValue(user) {
    return currentMode === "today" ? user.today : user.total;
}

function sortedLeaderboard() {
    return cachedLeaderboard
        .filter((user) => currentMode !== "today" || user.today > 0)
        .sort((a, b) => passesValue(b) - passesValue(a));
}

function tabBarHtml() {
    return `
        <div class="stats-tab-bar">
            <button class="tab ${currentMode === "total" ? "active" : ""}" data-mode="total">
                ${lucideIcon("trophy", "icon")}<span>Total Passes</span>
            </button>
            <button class="tab ${currentMode === "today" ? "active" : ""}" data-mode="today">
                ${lucideIcon("calendar-days", "icon")}<span>Today's Passes</span>
            </button>
        </div>
    `;
}

function bindTabs(body) {
    body.querySelectorAll(".stats-tab-bar .tab").forEach((tab) => {
        tab.onclick = () => {
            currentMode = tab.dataset.mode;
            currentPage = 1;
            renderTable();
        };
    });
}

function renderTable() {
    const body = document.getElementById("shrimp-leaderboard-body");
    if (!body) return;

    const users = sortedLeaderboard();

    if (users.length === 0) {
        body.innerHTML = `
            ${tabBarHtml()}
            <div class="card leaderboard">
                <p class="stats-empty">${currentMode === "today" ? "No passes recorded today." : "No passes recorded yet."}</p>
            </div>
        `;
        bindTabs(body);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(users.length / maxRow));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * maxRow;
    const pageUsers = users.slice(start, start + maxRow);
    const emptyRows = Array.from({ length: maxRow - pageUsers.length });

    body.innerHTML = `
        ${tabBarHtml()}
        <div class="card leaderboard">
            <div class="stats-table-wrap">
                <table class="stats-table">
                    <colgroup>
                        <col class="stats-rank-col" />
                        <col class="stats-user-col" />
                        <col class="shrimp-passes-col" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>${lucideIcon("trophy", "icon")}</th>
                            <th><label class="label-header">${lucideIcon("user", "icon")} User</label></th>
                            <th><label class="label-header">${lucideIcon("arrow-up-down", "icon")} Passes</label></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageUsers.map((user, index) => {
                            const rank = start + index + 1;
                            return `
                                <tr class="stats-row">
                                    <td class="stats-rank">${rank}</td>
                                    <td class="stats-user-cell">
                                        <div class="stats-user">
                                            ${ user.avatarURL ? `<img src="${decodeHtml(user.avatarURL)}" class="stats-avatar" alt="" />` : `
                                            <div class="stats-avatar"></div>` }
                                            <span class="stats-username">${decodeHtml(user.username)}</span>
                                        </div>
                                    </td>
                                    <td class="stats-num">${passesValue(user).toLocaleString()}</td>
                                </tr>
                            `;
                        }).join("")}
                        ${emptyRows.map(() => `
                            <tr class="stats-row-empty" aria-hidden="true">
                                <td></td><td></td><td></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            <div class="stats-pagination">
                <button class="btn small" id="shrimp-prev" aria-label="Previous page" ${currentPage === 1 ? "disabled" : ""}>
                    ${lucideIcon("chevron-left")}
                </button>
                <code class="stats-page-info">${currentPage} / ${totalPages}</code>
                <button class="btn small" id="shrimp-next" aria-label="Next page" ${currentPage === totalPages ? "disabled" : ""}>
                    ${lucideIcon("chevron-right")}
                </button>
            </div>
        </div>
    `;

    bindTabs(body);

    document.getElementById("shrimp-prev").onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    };
    document.getElementById("shrimp-next").onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    };
}

async function refreshLeaderboard() {
    clearTimeout(leaderboardTimer);
    const body = document.getElementById("shrimp-leaderboard-body");
    if (!body) return;

    const guildId = getGuildId();
    const response = await apiFetch("/api/games/shrimp/leaderboard?guild=" + guildId).catch(() => null);
    if (body !== document.getElementById("shrimp-leaderboard-body") || guildId !== getGuildId()) return;
    const resetAt = Number(response?.headers.get("X-Shrimp-Reset-At"));
    const delay = resetAt > 0 ? Math.max(0, Math.min(30000, resetAt - Date.now())) : 30000;
    leaderboardTimer = setTimeout(() => {
        if (body !== document.getElementById("shrimp-leaderboard-body") || guildId !== getGuildId()) return;
        if (resetAt > 0 && Date.now() >= resetAt) {
            cachedLeaderboard = cachedLeaderboard.map((user) => ({ ...user, today: 0, todayRank: null }));
            renderTable();
        }
        refreshLeaderboard();
    }, delay);
    if (!response) {
        body.innerHTML = `<p class="error-msg">Error 408 (Request Timeout)</p>`;
        return;
    }
    if (response.status === 401) {
        clearTimeout(leaderboardTimer);
        clearToken();
        return;
    }

    cachedLeaderboard = response.ok ? await response.json() : [];
    renderTable();
}

function updateGifPreview(gifUrl) {
    const preview = document.getElementById("shrimp-gif-preview");
    if (!preview) return;
    if (gifUrl) {
        preview.src = decodeHtml(gifUrl);
        preview.style.display = "block";
    } else {
        preview.style.display = "none";
    }
}

async function save() {
    const channelId = channelDropdown?.getSelectedValue() ?? "";
    const gifUrl = document.getElementById("shrimp-gif").value.trim();

    if (gifUrl && (!/^https?:\/\//i.test(gifUrl) || !/\.gif(\?|$)/i.test(gifUrl))) {
        showStatus("Invalid GIF URL", "error");
        return;
    }

    const saveBtn = document.getElementById("shrimp-save-btn");
    if (saveBtn) saveBtn.disabled = true;

    try {
        const response = await apiFetch("/api/games/shrimp?guild=" + getGuildId(), {
            method: "POST",
            body: JSON.stringify({ channelId, gifUrl })
        });

        if (response.status === 401) {
            clearToken();
            return;
        }

        if (response.ok) {
            showStatus("Saved", "success");
            updateGifPreview(gifUrl);
        } else {
            const data = await response.json().catch(() => ({}));
            showStatus(data.error || "Error", "error");
        }
    } catch {
        showStatus("Error", "error");
    } finally {
        const btn = document.getElementById("shrimp-save-btn");
        if (btn) btn.disabled = false;
    }
}

export async function renderShrimp(el) {
    clearTimeout(leaderboardTimer);
    cachedLeaderboard = [];
    currentPage = 1;
    container = el;
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const guild = getGuildId();
    const [resolveShrimp, resolveChannels] = await Promise.all([
        apiFetch("/api/games/shrimp?guild=" + guild).catch(() => null),
        apiFetch("/api/channels?guild=" + guild).catch(() => null)
    ]);

    if (resolveShrimp?.status === 401) {
        clearToken();
        return;
    }

    const config = resolveShrimp?.ok ? await resolveShrimp.json() : { channelId: null, gifUrl: null };
    const channels = resolveChannels?.ok ? await resolveChannels.json() : [];

    const channelOptions = [{ value: "", label: "Select a channel" },
        ...channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))
    ];

    const noChannels = channels.length === 0 ? `<label class="label-hint">No channels available!</label>` : "";

    container.innerHTML = `
        <div class="shrimp-layout">
            <div class="shrimp-left">
                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("shrimp", "icon")} Pass The Shrimp Down</label>
                    </div>
                    <div class="card-body">
                        <label class="label-hint">
                            Pass The Shrimp Down! A social mini-game where members have to keep sending a designated GIF in a channel.
                            <br>
                            Only the authorized GIF can be sent in that channel, once a member passes it they will be set on cooldown until the next day.
                        </label>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("settings-2", "icon")} Configuration</label>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Discord Channel</label>
                            ${dropdownTemplate({ id: "shrimp-channel", options: channelOptions, selectedValue: config.channelId ?? "", ariaLabel: "Select a Discord channel", className: "dropdown-menu--field" })}
                        </div>
                        <div class="field">
                            <label class="label-option">Authorized GIF URL</label>
                            <input type="text" id="shrimp-gif" placeholder="https://example.com/shrimp.gif" value="${decodeHtml(config.gifUrl ?? "")}" autocomplete="off" spellcheck="false" />
                            <label class="label-hint">Only messages containing this GIF will be allowed in the configured channel.</label>
                            <img id="shrimp-gif-preview" class="shrimp-gif-preview" src="${decodeHtml(config.gifUrl ?? "")}" alt="" style="${config.gifUrl ? "" : "display:none"}" onerror="this.style.display='none'" />
                        </div>
                        ${noChannels}
                    </div>
                </div>

                <div class="actions">
                    <span id="shrimp-status" class="status" style="display:none"></span>
                    <button class="btn secondary" id="shrimp-discard-btn">Discard changes</button>
                    <button class="btn primary" id="shrimp-save-btn">Save changes</button>
                </div>
            </div>

            <div class="shrimp-right">
                <div id="shrimp-leaderboard-body"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    channelDropdown = initializeDropdown(
        document.getElementById("shrimp-channel"),
        channelOptions
    );

    document.getElementById("shrimp-save-btn").onclick = save;
    document.getElementById("shrimp-discard-btn").onclick = () => renderShrimp(container);

    refreshLeaderboard();
}
