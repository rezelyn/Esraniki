import { apiFetch, clearToken, getGuildId } from "../api.js";
import { decodeHtml, lucideIcon, timestamp } from "../shared/style.js";


let cachedUsers = [];
let currentPage = 1;
const maxRow = 10;
let currentSort = {
	key: "messages",
	direction: "desc",
};

function sortIcon(key) {
	if (currentSort.key !== key) return lucideIcon("chevrons-up-down");
	return lucideIcon(currentSort.direction === "asc" ? "arrow-up" : "arrow-down");
}

function sortHeader(key, label, leadingIcon) {
	const active = currentSort.key === key;
	const nextDirection = active
		? currentSort.direction === "asc"
			? "descending"
			: "ascending"
		: "descending";
	return `
    <button
      class="stats-sort-btn ${active ? "active" : ""}"
      data-sort="${key}"
      aria-label="Sort ${label} ${nextDirection}"
      aria-pressed="${active ? "true" : "false"}"
    >
      ${lucideIcon(leadingIcon)}
      <span>${label}</span>
      <span class="stats-sort-icon">${sortIcon(key)}</span>
    </button>
  `;
}

function sortValue(user, key) {
	if (key === "messages") return user.messages;
	if (key === "vocal") return user.vocal;
	return 0;
}

function sortedUsers() {
	const direction = currentSort.direction === "asc" ? 1 : -1;
	return [...cachedUsers].sort((a, b) => {
		const valueDiff =
			(sortValue(a, currentSort.key) - sortValue(b, currentSort.key)) *
			direction;
		if (valueDiff !== 0) return valueDiff;
		return a.username.localeCompare(b.username, undefined, {
			sensitivity: "base",
		});
	});
}

function toggleSort(key) {
	if (currentSort.key === key) {
		currentSort = {
			key,
			direction: currentSort.direction === "asc" ? "desc" : "asc",
		};
	} else {
		currentSort = {
			key,
			direction: "desc",
		};
	}
	currentPage = 1;
	renderTable();
}

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
				? `<img src="${decodeHtml(user.avatarURL)}" class="stats-modal-avatar" alt="" />`
				: `<div class="stats-modal-avatar"></div>`
		}
        <div class="stats-modal-identity">
          <div class="stats-modal-name">${decodeHtml(user.username)}</div>
          <div class="stats-modal-id">${decodeHtml(user.userId)}</div>
        </div>
        <button class="btn-close stats-modal-close" id="stats-modal-close"></button>
      </div>

      <div class="stats-modal-grid">
        <div class="stat-card">
          <div class="label-header">${lucideIcon('message-circle')} Messages</div>
          <div class="stat-value">${user.messages.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="label-header">${lucideIcon('mic')} Vocal time</div>
          <div class="stat-value">${timestamp(user.vocal)}</div>
        </div>
        <div class="stat-card">
          <div class="label-header">${lucideIcon('trophy')} Message rank</div>
          <div class="stat-value">#${user.msgRank}</div>
        </div>
        <div class="stat-card">
          <div class="label-header">${lucideIcon('trophy')} Vocal rank</div>
          <div class="stat-value">#${user.vocalRank}</div>
        </div>
      </div>

      <div class="stats-modal-edit">
        <div class="field">
          <label class="label-title">Messages</label>
          <div class="num-input-wrap">
            <input type="number" id="edit-messages" value="${user.messages}" min="0" />
            <div class="num-input-btns">
              <button class="num-input-btn" data-target="edit-messages" data-delta="1">${lucideIcon('arrow-up')}</button>
              <button class="num-input-btn" data-target="edit-messages" data-delta="-1">${lucideIcon('arrow-down')}</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label-title">Vocal time (seconds)</label>
          <div class="num-input-wrap">
            <input type="number" id="edit-vocal" value="${user.vocal}" min="0" />
            <div class="num-input-btns">
              <button class="num-input-btn" data-target="edit-vocal" data-delta="1">${lucideIcon('arrow-up')}</button>
              <button class="num-input-btn" data-target="edit-vocal" data-delta="-1">${lucideIcon('arrow-down')}</button>
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
	window.lucide?.createIcons({ nodes: [overlay] });
	
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
			`/api/stats/user?guild=${getGuildId()}&user=${user.userId}`,
			{
				method: "POST",
				body: JSON.stringify({
					messages,
					vocal,
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
			`/api/stats/user?guild=${getGuildId()}&user=${user.userId}`,
			{
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

	const users = sortedUsers();
	const totalPages = Math.max(1, Math.ceil(users.length / maxRow));
	currentPage = Math.min(currentPage, totalPages);
	const start = (currentPage - 1) * maxRow;
	const pageUsers = users.slice(start, start + maxRow);
	const emptyRows = Array.from({
		length: maxRow - pageUsers.length,
	});

	const paginationHtml = `
    <div class="stats-pagination">
      <button class="btn-action" id="stats-prev" aria-label="Previous page" ${currentPage === 1 ? "disabled" : ""}>
        ${lucideIcon("chevron-left")}
      </button>
      <span class="stats-page-info">${currentPage} / ${totalPages}</span>
      <button class="btn-action" id="stats-next" aria-label="Next page" ${currentPage === totalPages ? "disabled" : ""}>
        ${lucideIcon("chevron-right")}
      </button>
    </div>
  `;

	body.innerHTML = `
    <div class="stats-card">
      <div class="stats-table-wrap">
        <table class="stats-table">
          <colgroup>
            <col class="stats-rank-col" />
            <col class="stats-user-col" />
            <col class="stats-messages-col" />
            <col class="stats-vocal-col" />
          </colgroup>
          <thead>
            <tr>
              <th>${lucideIcon("trophy")}</th>
              <th>${lucideIcon("user")}User</th>
              <th>${sortHeader("messages", "Messages", "message-circle")}</th>
              <th>${sortHeader("vocal", "Vocal time", "mic")}</th>
            </tr>
          </thead>
          <tbody>
            ${pageUsers
				.map((u, i) => {
					const rank = start + i + 1;
					return `
              <tr class="stats-row" data-user-id="${decodeHtml(u.userId)}">
                <td class="stats-rank">${rank}</td>
                <td class="stats-user-cell">
                  <div class="stats-user">
                    ${u.avatarURL ? `<img src="${decodeHtml(u.avatarURL)}" class="stats-avatar" alt="" />` : `<div class="stats-avatar"></div>`}
                    <span class="stats-username">${decodeHtml(u.username)}</span>
                  </div>
                </td>
                <td class="stats-num">${u.messages.toLocaleString()}</td>
                <td class="stats-num">${timestamp(u.vocal)}</td>
              </tr>`;
				})
				.join("")}
            ${emptyRows
				.map(
					() => `
              <tr class="stats-row-empty" aria-hidden="true">
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>`,
				)
				.join("")}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    </div>
  `;

	body.querySelectorAll(".stats-sort-btn").forEach((btn) => {
		btn.onclick = () => toggleSort(btn.dataset.sort);
	});

	body.querySelector("tbody").onclick = (e) => {
		const row = e.target.closest(".stats-row");
		if (!row) return;
		const user = cachedUsers.find((u) => u.userId === row.dataset.userId);
		if (user) renderModal(user);
	};

	document.getElementById("stats-prev").onclick = () => {
		if (currentPage > 1) {
			currentPage--;
			renderTable();
		}
	};
	document.getElementById("stats-next").onclick = () => {
		if (currentPage < totalPages) {
			currentPage++;
			renderTable();
		}
	};

	window.lucide?.createIcons({
		nodes: [body],
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
	currentSort = {
		key: "messages",
		direction: "desc",
	};

	renderTable();
}

export async function renderStats(container) {
	document.getElementById("stats-modal")?.remove();
	container.innerHTML = `
    <div class="stats-page">
      <div class="stats-tab-bar">
        <button class="tab active" data-tab="leaderboard">${lucideIcon('trophy')} LEADERBOARD</button>
        <button class="tab" data-tab="analytics">${lucideIcon('bar-chart-2')} ANALYTICS</button>
        <button class="tab" data-tab="charts">${lucideIcon('bar-chart-3')} CHARTS</button>
      </div>
      <div id="stats-body"></div>
    </div>
  `;
	refreshLeaderboard();
}
