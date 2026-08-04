import { apiFetch, clearToken, getGuildId } from "../backend/api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let state = { entries: [] };
let channels = [];
let twitchAvatars = {};
let container = null;
let statusTimer = null;
let nextId = 1;

function showStatus(message, type) {
    const element = document.getElementById("twitch-status");
    if (!element) return;

    element.textContent = message;
    element.className = "status " + type;
    element.style.display = "inline-block";

    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        element.classList.add("hiding");
        element.addEventListener("animationend", () => 
            { 
                element.style.display = "none";
            },
            {
                once: true
            }
        );
    }, 3000);
}

function channelOptions() {
    return [{ value: "", label: "Select a channel" }, 
        ...channels.map((channel) => (
            {
                value: channel.id,
                label: `#${channel.name}`
            }
        ))
    ];
}

function autoResize(page) {
    page.style.height = "auto";
    page.style.height = page.scrollHeight + "px";
}

function renderEntries() {
    const element = document.getElementById("twitch-entries");
    if (!element) return;

    if (state.entries.length === 0) {
        element.innerHTML = `<label class="label-hint" style="padding:0.5rem 0;text-align:center">No channels configured yet.</label>`;
        return;
    }

    element.innerHTML = state.entries
        .map((entry, i) => `
                <div class="card" style="margin-bottom:1rem">
                    <div class="card-header">
                        <label class="label-header">${entry.twitchChannel ? `<span style="color:var(--accent)">twitch.tv/</span>${decodeHtml(entry.twitchChannel)}` : "New channel"}</span>
                        <button class="btn small danger" data-action="remove" data-i="${i}">${lucideIcon("x", "icon")}</button>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Discord Channel</label>
                            ${dropdownTemplate({ id: `twitch-channel-${entry.id}`, options: channelOptions(), selectedValue: entry.discordChannelId ?? "", ariaLabel: "Select a Discord announcement channel", className: "dropdown-menu--field" })}
                        </div>
                        <div class="field">
                            <label class="label-option">Twitch channel</label>
                            <input type="text" data-field="twitchChannel" data-i="${i}" value="${decodeHtml(entry.twitchChannel)}" placeholder="Username" maxlength="64" autocomplete="off" spellcheck="false" />
                        </div>
                        <div class="field">
                            <label class="label-option">Announcement Message</label>
                            <textarea data-field="message" data-i="${i}" maxlength="500" rows="2" placeholder="{streamer} is now live on Twitch! Check it out:">${decodeHtml(entry.message)}</textarea>
                            <p class="label-hint">Available variables: <code>{streamer}</code>, <code>{title}</code>, <code>{game}</code>, <code>{url}</code>.</p>
                        </div>
                    </div>
                </div>
            `,
        )
        .join("");

    element.querySelectorAll("textarea").forEach(autoResize);
    state.entries.forEach((entry, index) => {
        initializeDropdown(
            document.getElementById(`twitch-channel-${entry.id}`),
            channelOptions(),
            (option) => {
                state.entries[index].discordChannelId = option.value;
                renderSummary();
            }
        );
    });
    element.oninput = handleInput;
    element.onclick = handleClick;
}

function handleInput(event) {
    const element = event.target;
    const i = element.dataset.i;
    const field = element.dataset.field;

    if (i == null || !field) return;
    state.entries[+i][field] = element.value;

    if (field === "twitchChannel") {
        const header = element.closest(".card")?.querySelector(".card-header span");
        if (header) {
            header.innerHTML = element.value ? `<label class="label-header" style="color:var(--accent)">twitch.tv/</label>${decodeHtml(element.value)}` : "New channel";
        }
    }

    if (element.tagName === "TEXTAREA") autoResize(element);
}

function handleClick(event) {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    event.preventDefault();
    if (btn.dataset.action === "remove") {
        state.entries.splice(+btn.dataset.i, 1);
        renderEntries();
    }
}

function addEntry() {
    state.entries.push({
        id: nextId++,
        twitchChannel: "",
        discordChannelId: "",
        message: ""
    });
    renderEntries();
}

async function save() {
    try {
        const response = await apiFetch("/api/twitch?guild=" + getGuildId(), {
            method: "POST",
            body: JSON.stringify(state)
        });

        if (response.status === 401) {
            clearToken();
            return;
        }

        if (response.ok) {
            const data = await response.json();
            if (data.entries) {
                state.entries = data.entries;
                nextId = state.entries.reduce((m, e) => Math.max(m, e.id ?? 0), 0) + 1;
                renderEntries();
            }
            showStatus("Saved", "success");
        } else {
            const data = await response.json().catch(() => ({}));
            showStatus(data.error || "Error", "error");
        }
    } catch {
        showStatus("Error", "error");
    }
}

export async function renderTwitch(page) {
    container = page;
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const guild = getGuildId();
    const [resolveTwitch, resolveChannels] = await Promise.all([
        apiFetch("/api/twitch?guild=" + guild).catch(() => null),
        apiFetch("/api/channels?guild=" + guild).catch(() => null)
    ]);

    if (resolveTwitch?.status === 401) {
        clearToken();
        return;
    }

    const loaded = resolveTwitch?.ok ? await resolveTwitch.json() : null;
    state = loaded ?? { entries: [] };

    if (!state.entries) state.entries = [];
    nextId = state.entries.reduce((m, e) => Math.max(m, e.id ?? 0), 0) + 1;
    channels = resolveChannels?.ok ? await resolveChannels.json() : [];

    const noChannels = channels.length === 0 ? `<label class="label-hint">No channels available!</label>` : "";

    container.innerHTML = `
        <div class="twitch-layout">
            <div class="twitch-left">
                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("monitor", "icon")} Twitch Announcements</label>
                    </div>
                    <div class="card-body">
                        <label class="label-hint">
                            Automatically post a message in a Discord channel when a Twitch streamer goes live. Each entry monitors one Twitch channel and announces in the selected Discord channel.
                        </label>
                        ${noChannels}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("link", "icon")} Configured Channels</label>
                    </div>
                    <div class="card-body">
                        <div id="twitch-summary"></div>
                    </div>
                </div>

                <div class="actions">
                    <span id="twitch-status" class="status" style="display:none"></span>
                    <button class="btn secondary" id="twitch-discard-btn">Discard changes</button>
                    <button class="btn primary" id="twitch-save-btn">Save changes</button>
                </div>
            </div>

            <div class="twitch-right">
                <div id="twitch-entries"></div>
                <button class="btn full dotted" type="dotted" id="twitch-add-btn">
                    <label class="label-hint">+ Add Twitch channel</label>
                </button>
            </div>
        </div>
    `;

    renderEntries();
    renderSummary();
    loadAvatars();

    document.getElementById("twitch-add-btn").onclick = () => {
        addEntry();
        renderSummary();
    };
    document.getElementById("twitch-save-btn").onclick = async () => {
        await save();
        renderSummary();
        loadAvatars();
    };
    document.getElementById("twitch-discard-btn").onclick = () =>
        renderTwitch(container);
}

function renderSummary() {
    const element = document.getElementById("twitch-summary");
    if (!element) return;
    if (state.entries.length === 0) {
        element.innerHTML = `<p class="label-hint">No channels configured.</p>`;
        return;
    }
    element.innerHTML = state.entries
        .map((entry) => {
            const channel = channels.find((current) => current.id === entry.discordChannelId);
            const avatar = twitchAvatars[entry.twitchChannel?.toLowerCase()];
            const avatarHtml = avatar
                ? `<img src="${decodeHtml(avatar)}" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
                : `<span style="width:20px;height:20px;border-radius:50%;background:var(--surface0);display:inline-block;flex-shrink:0"></span>`;
            return `
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.875rem">
                    ${avatarHtml}
                    <a href="https://twitch.tv/${decodeHtml(entry.twitchChannel)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none">@${decodeHtml(entry.twitchChannel || "")}</a>
                </div>
            `;
        })
        .join("");
}

async function loadAvatars() {
    const logins = state.entries.map((element) => element.twitchChannel).filter(Boolean);
    if (logins.length === 0) return;
    try {
        const response = await apiFetch("/api/twitch/avatars?guild=" + getGuildId());
        if (response.ok) {
            twitchAvatars = await response.json();
            renderSummary();
        }
    } catch {}
}
