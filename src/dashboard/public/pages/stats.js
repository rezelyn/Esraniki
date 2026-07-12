import {
    apiFetch,
    clearToken,
    getGuildId
} from "../api.js";

function formatVocal(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function esc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function icon(name) {
    return `<i data-lucide="${name}" class="stat-icon"></i>`;
}

let cachedUsers = [];
let currentPage = 1;
const PAGE_SIZE = 15;

function closeModal(overlay) {
    const modal = overlay.querySelector(".modal");
    overlay.classList.add("closing");
    if (modal) modal.classList.add("closing");
    overlay.addEventListener("animationend", () => overlay.remove(), {
        once: true,
    });
}

function renderModal(user) {
    document.getElementById("stats-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "stats-modal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
    <div class="modal stats-user-modal">
      <div class="stats-modal-head">
        ${
          user.avatarURL
            ? `<img src="${esc(user.avatarURL)}" class="stats-modal-avatar" alt="" />`
            : `<div class="stats-modal-avatar"></div>`
        }
        <div class="stats-modal-identity">
          <div class="stats-modal-name">${esc(user.username)}</div>
          <div class="stats-modal-id">${esc(user.userId)}</div>
        </div>
        <button class="btn-icon stats-modal-close" id="stats-modal-close" title="Close">✕</button>
      </div>

      <div class="stats-modal-grid">
        <div class="stat-card">
          <div class="stat-label"><i data-lucide="message-circle" class="stat-icon"></i>Messages</div>
          <div class="stat-value">${user.messages.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label"><i data-lucide="mic" class="stat-icon"></i>Vocal time</div>
          <div class="stat-value">${formatVocal(user.vocal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label"><i data-lucide="trophy" class="stat-icon"></i>Message rank</div>
          <div class="stat-value">#${user.msgRank}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label"><i data-lucide="trophy" class="stat-icon"></i>Vocal rank</div>
          <div class="stat-value">#${user.vocalRank}</div>
        </div>
      </div>

      <div class="stats-modal-edit">
        <div class="field">
          <label>Messages</label>
          <div class="num-input-wrap">
            <input type="number" id="edit-messages" value="${user.messages}" min="0" />
            <div class="num-input-btns">
              <button class="num-input-btn" data-target="edit-messages" data-delta="1">▲</button>
              <button class="num-input-btn" data-target="edit-messages" data-delta="-1">▼</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label>Vocal time (seconds)</label>
          <div class="num-input-wrap">
            <input type="number" id="edit-vocal" value="${user.vocal}" min="0" />
            <div class="num-input-btns">
              <button class="num-input-btn" data-target="edit-vocal" data-delta="1">▲</button>
              <button class="num-input-btn" data-target="edit-vocal" data-delta="-1">▼</button>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <span id="stats-modal-status" class="status" style="display:none"></span>
        <button class="btn btn-ghost stats-delete-btn" id="stats-delete-btn">Delete user</button>
        <button class="btn btn-accent" id="stats-save-btn">Save</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    window.lucide?.createIcons({
        nodes: [overlay]
    });

    overlay.addEventListener("click", (e) => {
        const btn = e.target.closest(".num-input-btn");
        if (!btn) return;
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        input.value = Math.max(
            0,
            (parseInt(input.value, 10) || 0) + parseInt(btn.dataset.delta, 10),
        );
    });

    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal(overlay);
    };
    document.getElementById("stats-modal-close").onclick = () =>
        closeModal(overlay);

    window.addEventListener("hashchange", () => closeModal(overlay), {
        once: true,
    });

    document.getElementById("stats-save-btn").onclick = async () => {
        const messages = Math.max(
            0,
            parseInt(document.getElementById("edit-messages").value, 10) || 0,
        );
        const vocal = Math.max(
            0,
            parseInt(document.getElementById("edit-vocal").value, 10) || 0,
        );
        const r = await apiFetch(
            `/api/stats/user?guild=${getGuildId()}&user=${user.userId}`, {
                method: "POST",
                body: JSON.stringify({
                    messages,
                    vocal
                }),
            },
        ).catch(() => null);
        if (r?.ok) {
            closeModal(overlay);
            refreshLeaderboard();
        } else {
            const statusEl = document.getElementById("stats-modal-status");
            if (statusEl) {
                statusEl.textContent = "Failed to save";
                statusEl.className = "status error";
                statusEl.style.display = "inline-block";
            }
        }
    };

    document.getElementById("stats-delete-btn").onclick = async () => {
        if (!confirm(`Delete all stats for ${user.username}?`)) return;
        const r = await apiFetch(
            `/api/stats/user?guild=${getGuildId()}&user=${user.userId}`, {
                method: "DELETE",
            },
        ).catch(() => null);
        if (r?.ok) {
            closeModal(overlay);
            refreshLeaderboard();
        }
    };
}

function renderTable() {
    const body = document.getElementById("stats-body");
    if (!body) return;

    const totalPages = Math.max(1, Math.ceil(cachedUsers.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageUsers = cachedUsers.slice(start, start + PAGE_SIZE);

    const paginationHtml =
        totalPages > 1 ?
        `
    <div class="stats-pagination">
      <button class="stats-page-btn" id="stats-prev" ${currentPage === 1 ? "disabled" : ""}>◀</button>
      <span class="stats-page-info">${currentPage} / ${totalPages}</span>
      <button class="stats-page-btn" id="stats-next" ${currentPage === totalPages ? "disabled" : ""}>▶</button>
    </div>
  ` :
        "";

    body.innerHTML = `
    <div class="stats-card">
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>${icon("trophy")}</th>
              <th>${icon("user")}User</th>
              <th>${icon("message-circle")}Messages</th>
              <th>${icon("mic")}Vocal time</th>
            </tr>
          </thead>
          <tbody>
            ${pageUsers
              .map((u, i) => {
                const rank = start + i + 1;
                return `
              <tr class="stats-row" data-idx="${start + i}">
                <td class="stats-rank">${rank}</td>
                <td class="stats-user-cell">
                  ${u.avatarURL ? `<img src="${esc(u.avatarURL)}" class="stats-avatar" alt="" />` : `<div class="stats-avatar"></div>`}
                  <span class="stats-username">${esc(u.username)}</span>
                </td>
                <td class="stats-num">${u.messages.toLocaleString()}</td>
                <td class="stats-num">${formatVocal(u.vocal)}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    </div>
  `;

    body.querySelector("tbody").onclick = (e) => {
        const row = e.target.closest(".stats-row");
        if (!row) return;
        renderModal(cachedUsers[+row.dataset.idx]);
    };

    if (totalPages > 1) {
        document.getElementById("stats-prev").onclick = () => {
            currentPage--;
            renderTable();
        };
        document.getElementById("stats-next").onclick = () => {
            currentPage++;
            renderTable();
        };
    }

    window.lucide?.createIcons({
        nodes: [body]
    });
}

async function refreshLeaderboard() {
    const body = document.getElementById("stats-body");
    if (!body) return;
    body.innerHTML = `<div class="spinner"></div>`;

    const res = await apiFetch("/api/stats?guild=" + getGuildId()).catch(
        () => null,
    );
    if (!res) {
        body.innerHTML = `<p class="error-msg">Error 408 (Request Timeout)</p>`;
        return;
    }
    if (res.status === 401) {
        clearToken();
        return;
    }

    cachedUsers = await res.json();
    currentPage = 1;

    if (cachedUsers.length === 0) {
        body.innerHTML = `<p class="stats-empty">No stats recorded yet for this guild.</p>`;
        return;
    }

    renderTable();
}

export async function renderStats(container) {
    document.getElementById("stats-modal")?.remove();
    container.innerHTML = `
    <div id="stats-body"></div>
  `;
    refreshLeaderboard();
}
