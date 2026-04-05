import { apiFetch, clearToken, getGuildId } from "../api.js";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let refreshTimer = null;
let countdownTimer = null;

export async function renderMinecraft(container) {
  clearInterval(refreshTimer);
  clearInterval(countdownTimer);
  container.innerHTML = `<div class="spinner"></div>`;

  const guild = getGuildId();
  const [stateRes, channelsRes] = await Promise.all([
    apiFetch("/api/minecraft?guild=" + guild).catch(() => null),
    apiFetch("/api/channels?guild=" + guild).catch(() => null),
  ]);

  if (stateRes?.status === 401) { clearToken(); return; }

  const state = stateRes?.ok ? await stateRes.json() : { tracking: false };
  const channels = channelsRes?.ok ? await channelsRes.json() : [];

  const channelOptions = channels
    .map((c) => `<option value="${esc(c.id)}" ${c.id === state.channelId ? "selected" : ""}>#${esc(c.name)}</option>`)
    .join("");

  container.innerHTML = `
    <div class="minecraft-layout">
      <div class="minecraft-left">
        <div class="card">
          <div class="card-header"><span>Track Server</span></div>
          <div class="card-body">
            <div class="field">
              <label>Server IP</label>
              <input type="text" id="mc-ip" placeholder="play.example.com" value="${esc(state.server ?? "")}" />
            </div>
            <div class="field">
              <label>Display name</label>
              <input type="text" id="mc-name" placeholder="My Server" value="${esc(state.name ?? "")}" />
            </div>
            <div class="field">
              <label>Discord channel</label>
              <select id="mc-channel">
                <option value="">Select a channel</option>
                ${channelOptions}
              </select>
            </div>
            <p class="field-hint">The bot will post and continuously update a status embed in the selected channel.</p>
          </div>
        </div>

        <div class="actions" style="margin-top: 0.75rem;">
          <span id="mc-status" class="status" style="display:none"></span>
          ${state.tracking ? `<button class="btn-mc-action btn-mc-danger has-tooltip" id="mc-untrack-btn" data-tooltip="Stop tracking"><i data-lucide="square"></i></button>` : ""}
          ${state.tracking ? `<button class="btn-mc-action has-tooltip" id="mc-refresh-btn" data-tooltip="Force refresh"><i data-lucide="refresh-cw"></i></button>` : ""}
          <button class="btn btn-accent" id="mc-track-btn">${state.tracking ? "Update" : "Start tracking"}</button>
        </div>
        ${state.tracking ? `<p class="mc-countdown-label">Next update in: <span id="mc-countdown">…</span></p>` : ""}
      </div>

      <div class="minecraft-right">
        <div class="card" id="mc-preview-card">
          <div class="card-header">
            <span>Server Status</span>
          </div>
          <div class="card-body" id="mc-preview">
            ${state.tracking ? `<div class="spinner"></div>` : `<p class="field-hint" style="margin:0">No server is being tracked.</p>`}
          </div>
        </div>
        <div class="card" id="mc-players-card" style="margin-top: 1rem; ${state.tracking ? "" : "display:none"}">
          <div class="card-header"><span id="mc-players-title">Connected Players</span></div>
          <div class="card-body" id="mc-players-body"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  window.lucide?.createIcons();

  if (state.tracking) loadPreview();

  function showStatus(msg, type) {
    const el = document.getElementById("mc-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "status " + type;
    el.style.display = "inline-block";
    el.classList.remove("hiding");
    setTimeout(() => {
      el.classList.add("hiding");
      el.addEventListener("animationend", () => { el.style.display = "none"; }, { once: true });
    }, 3000);
  }

  function startCountdown(seconds) {
    clearInterval(countdownTimer);
    let remaining = seconds;
    const el = document.getElementById("mc-countdown");
    if (el) el.textContent = `${remaining}s`;
    countdownTimer = setInterval(() => {
      remaining--;
      const el = document.getElementById("mc-countdown");
      if (!el) { clearInterval(countdownTimer); return; }
      el.textContent = remaining <= 0 ? "updating…" : `${remaining}s`;
    }, 1000);
  }

  async function loadPreview() {
    const preview = document.getElementById("mc-preview");
    if (!preview) return;
    const r = await apiFetch("/api/minecraft/status?guild=" + guild).catch(() => null);
    if (!r) { preview.innerHTML = `<p class="field-hint" style="margin:0">Failed to fetch server status.</p>`; return; }
    if (r.status === 401) { clearToken(); return; }
    const data = r.ok ? await r.json() : null;
    if (!data) { preview.innerHTML = `<p class="field-hint" style="margin:0">No data available.</p>`; return; }
    renderPreview(preview, data);
    renderPlayers(data);
    startCountdown(30);
  }

  function renderPreview(el, data) {
    const statusColor = data.online ? "var(--green)" : "var(--muted)";
    const iconUrl = `https://api.mcsrvstat.us/icon/${encodeURIComponent(state.server)}`;

    el.innerHTML = `
      <div class="mc-preview-top">
        <div class="mc-status-grid">
          <div class="mc-stat-card">
            <div class="stat-label">Status</div>
            <div class="stat-value" style="color:${statusColor}">${data.online ? "Online" : "Offline"}</div>
          </div>
          <div class="mc-stat-card">
            <div class="stat-label">Players</div>
            <div class="stat-value">${data.players?.online ?? 0} / ${data.players?.max ?? 0}</div>
          </div>
          <div class="mc-stat-card">
            <div class="stat-label">Version</div>
            <div class="stat-value mc-version">${esc(data.version ?? "Unknown")}</div>
          </div>
        </div>
        <img class="mc-server-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'" />
      </div>
      ${data.motd ? `<div class="mc-motd">${esc(data.motd)}</div>` : ""}
    `;
  }

  function renderPlayers(data) {
    const card = document.getElementById("mc-players-card");
    const body = document.getElementById("mc-players-body");
    const title = document.getElementById("mc-players-title");
    if (!card || !body) return;

    const list = data.players?.list ?? [];
    const count = data.players?.online ?? 0;
    if (title) title.textContent = `Connected Players`;
    card.style.display = "";

    if (list.length === 0) {
      body.innerHTML = `<p class="field-hint" style="margin:0">${data.online ? "No players connected." : "Server is offline."}</p>`;
      return;
    }

    body.innerHTML = list.map((p) => {
      const name = p.name ?? p;
      const identifier = p.uuid ?? name;
      const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(identifier)}/32`;
      return `
        <div class="mc-player-row">
          <img class="mc-player-avatar" src="${esc(avatarUrl)}" alt="${esc(name)}" onerror="this.src='https://mc-heads.net/avatar/steve/32'" />
          <span class="mc-player-name">${esc(name)}</span>
        </div>`;
    }).join("");
  }

  document.getElementById("mc-track-btn").onclick = async () => {
    const ip = document.getElementById("mc-ip").value.trim();
    const name = document.getElementById("mc-name").value.trim() || ip;
    const channelId = document.getElementById("mc-channel").value;
    if (!ip) { showStatus("Enter a server IP", "error"); return; }
    if (!channelId) { showStatus("Select a channel", "error"); return; }

    const r = await apiFetch("/api/minecraft/track?guild=" + guild, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, name, channelId }),
    }).catch(() => null);

    if (r?.ok) {
      showStatus("Tracking started", "success");
      setTimeout(() => renderMinecraft(container), 1200);
    } else {
      const err = r ? await r.json().catch(() => ({})) : {};
      showStatus(err.error || "Failed to start tracking", "error");
    }
  };

  const untrackBtn = document.getElementById("mc-untrack-btn");
  if (untrackBtn) {
    untrackBtn.onclick = async () => {
      if (!confirm("Stop tracking this server?")) return;
      const r = await apiFetch("/api/minecraft/untrack?guild=" + guild, { method: "POST" }).catch(() => null);
      if (r?.ok) renderMinecraft(container);
      else showStatus("Failed to stop tracking", "error");
    };
  }

  const refreshBtn = document.getElementById("mc-refresh-btn");
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      const r = await apiFetch("/api/minecraft/refresh?guild=" + guild, { method: "POST" }).catch(() => null);
      if (r?.ok) {
        showStatus("Refreshed", "success");
        const body = await r.json();
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
