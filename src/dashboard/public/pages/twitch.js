import { apiFetch, clearToken, getGuildId } from "../api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let state = {
	entries: [],
};
let channels = [];
let twitchAvatars = {};
let container = null;
let statusTimer = null;
let nextId = 1;

function showStatus(msg, type) {
	const el = document.getElementById("twitch-status");
	if (!el) return;
	el.textContent = msg;
	el.className = "status " + type;
	el.style.display = "inline-block";
	clearTimeout(statusTimer);
	statusTimer = setTimeout(() => {
		el.classList.add("hiding");
		el.addEventListener(
			"animationend",
			() => {
				el.style.display = "none";
			},
			{
				once: true,
			}
		);
	}, 3000);
}

function channelOptions() {
	return [
		{ value: "", label: "Unselected" },
		...channels.map((channel) => ({
			value: channel.id,
			label: `#${channel.name}`,
		})),
	];
}

function autoResize(el) {
	el.style.height = "auto";
	el.style.height = el.scrollHeight + "px";
}

function renderEntries() {
	const el = document.getElementById("twitch-entries");
	if (!el) return;

	if (state.entries.length === 0) {
		el.innerHTML = `<p class="field-hint" style="padding:0.5rem 0;text-align:center">No channels configured yet. Use the button below to add one.</p>`;
		return;
	}

	el.innerHTML = state.entries
		.map(
			(entry, i) => `
	    <div class="card" style="margin-bottom:1rem">
	      <div class="card-header">
	        <span>${entry.twitchChannel ? `<span style="color:var(--accent)">twitch.tv/</span>${decodeHtml(entry.twitchChannel)}` : "New channel"}</span>
	        <button class="btn-close" data-action="remove" data-i="${i}" title="Remove">${lucideIcon("x")}</button>
	      </div>
	      <div class="card-body">
	        <div class="field">
	          <label>Discord announcement channel</label>
	          ${dropdownTemplate({ id: `twitch-channel-${entry.id}`, options: channelOptions(), selectedValue: entry.discordChannelId ?? "", ariaLabel: "Select a Discord announcement channel", className: "dropdown-menu--field" })}
	        </div>
	        <div class="field">
	          <label>Twitch channel</label>
	          <input
	            type="text"
	            data-field="twitchChannel"
				data-i="${i}"
	            value="${decodeHtml(entry.twitchChannel)}"
	            placeholder="channelname"
	            maxlength="64"
	            autocomplete="off"
	            spellcheck="false"
	          />
	        </div>
	        <div class="field">
	          <label>Custom message</label>
	          <textarea
	            data-field="message"
			data-i="${i}"
	            maxlength="500"
	            rows="2"
	            placeholder="{streamer} is now live on Twitch! Check it out:"
	          >${decodeHtml(entry.message)}</textarea>
	          <p class="field-hint">Available variables: <code>{streamer}</code>, <code>{title}</code>, <code>{game}</code>, <code>{url}</code>.</p>
	        </div>
	      </div>
	    </div>
	  `,
		)
		.join("");

	el.querySelectorAll("textarea").forEach(autoResize);
	state.entries.forEach((entry, index) => {
		initializeDropdown(
			document.getElementById(`twitch-channel-${entry.id}`),
			channelOptions(),
			(option) => {
				state.entries[index].discordChannelId = option.value;
				renderSummary();
			},
		);
	});
	el.oninput = handleInput;
	el.onclick = handleClick;
}

function handleInput(e) {
	const el = e.target;
	const i = el.dataset.i;
	const field = el.dataset.field;
	if (i == null || !field) return;
	state.entries[+i][field] = el.value;
	if (field === "twitchChannel") {
		const header = el.closest(".card")?.querySelector(".card-header span");
		if (header) {
			header.innerHTML = el.value
				? `<span style="color:var(--accent)">twitch.tv/</span>${decodeHtml(el.value)}`
				: "New channel";
		}
	}
	if (el.tagName === "TEXTAREA") autoResize(el);
}

function handleClick(e) {
	const btn = e.target.closest("[data-action]");
	if (!btn) return;
	e.preventDefault();
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
		message: "",
	});
	renderEntries();
}

async function save() {
	try {
		const res = await apiFetch("/api/twitch?guild=" + getGuildId(), {
			method: "POST",
			body: JSON.stringify(state),
		});
		if (res.status === 401) {
			clearToken();
			return;
		}
		if (res.ok) {
			const data = await res.json();
			if (data.entries) {
				state.entries = data.entries;
				nextId =
					state.entries.reduce((m, e) => Math.max(m, e.id ?? 0), 0) +
					1;
				renderEntries();
			}
			showStatus("Saved", "success");
		} else {
			const data = await res.json().catch(() => ({}));
			showStatus(data.error || "Error", "error");
		}
	} catch {
		showStatus("Error", "error");
	}
}

export async function renderTwitch(el) {
	container = el;
	container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

	const guild = getGuildId();
	const [twitchRes, channelsRes] = await Promise.all([
		apiFetch("/api/twitch?guild=" + guild).catch(() => null),
		apiFetch("/api/channels?guild=" + guild).catch(() => null),
	]);

	if (twitchRes?.status === 401) {
		clearToken();
		return;
	}

	const loaded = twitchRes?.ok ? await twitchRes.json() : null;
	state = loaded ?? {
		entries: [],
	};
	if (!state.entries) state.entries = [];
	nextId = state.entries.reduce((m, e) => Math.max(m, e.id ?? 0), 0) + 1;

	channels = channelsRes?.ok ? await channelsRes.json() : [];

	const noChannels =
		channels.length === 0
			? `<p class="field-hint">No channels available!</p>`
			: "";

	container.innerHTML = `
	    <div class="twitch-layout">
	      <div class="twitch-left">
	        <div class="card">
	          <div class="card-header"><span>Twitch Announcements</span></div>
	          <div class="card-body">
	            <p class="field-hint">
	              Automatically post a message in a Discord channel when a Twitch streamer goes live.
	              Each entry monitors one Twitch channel and announces in the selected Discord channel.
	            </p>
	            ${noChannels}
	          </div>
	        </div>

	        <div class="card">
	          <div class="card-header"><span>Configured channels</span></div>
	          <div class="card-body">
	            <div id="twitch-summary"></div>
	          </div>
	        </div>

	        <div class="actions">
	          <span id="twitch-status" class="status" style="display:none"></span>
	          <button class="btn btn-ghost" id="twitch-discard-btn">Discard changes</button>
	          <button class="btn btn-accent" id="twitch-save-btn">Save changes</button>
	        </div>
	      </div>

	      <div class="twitch-right">
	        <div id="twitch-entries"></div>
	        <button class="btn-add full" id="twitch-add-btn">+ Add Twitch channel</button>
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
	const el = document.getElementById("twitch-summary");
	if (!el) return;
	if (state.entries.length === 0) {
		el.innerHTML = `<p class="field-hint">No channels configured.</p>`;
		return;
	}
	el.innerHTML = state.entries
		.map((entry) => {
			const ch = channels.find((c) => c.id === entry.discordChannelId);
			const avatar = twitchAvatars[entry.twitchChannel?.toLowerCase()];
			const avatarHtml = avatar
				? `<img src="${decodeHtml(avatar)}" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
				: `<span style="width:20px;height:20px;border-radius:50%;background:var(--surface0);display:inline-block;flex-shrink:0"></span>`;
			return `
	      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.875rem">
	        ${avatarHtml}
	        <a href="https://twitch.tv/${decodeHtml(entry.twitchChannel)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none">@${decodeHtml(entry.twitchChannel || "—")}</a>
	      </div>`;
		})
		.join("");
}

async function loadAvatars() {
	const logins = state.entries.map((e) => e.twitchChannel).filter(Boolean);
	if (logins.length === 0) return;
	try {
		const res = await apiFetch("/api/twitch/avatars?guild=" + getGuildId());
		if (res.ok) {
			twitchAvatars = await res.json();
			renderSummary();
		}
	} catch {}
}