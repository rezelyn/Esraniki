import {
    apiFetch,
    clearToken,
    getGuildId
} from "../api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let state = null;
let channels = [];
let container = null;
let statusTimer = null;

function showStatus(msg, type) {
    const el = document.getElementById("rules-status");
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
            }, {
                once: true
            },
        );
    }, 3000);
}

function autoResize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

function renderSections() {
    const el = document.getElementById("sections-container");
    if (!el) return;

    el.innerHTML = state.sections
        .map((section, si) => {
            const rulesHtml = section.rules
                .map(
                    (rule, ri) => `
      <div class="rule-row">
        <span class="rule-num">${section.id}.${rule.id}.</span>
        <textarea class="rule-input" data-si="${si}" data-ri="${ri}" placeholder="Rule text" rows="1">${decodeHtml(rule.text)}</textarea>
        <button class="btn-close" data-action="remove-rule" data-si="${si}" data-ri="${ri}">${lucideIcon("x")}</button>
      </div>
    `,
                )
                .join("");

            return `
      <div class="section">
        <div class="section-head">
          <span class="section-num">${section.id}.</span>
          <input type="text" value="${decodeHtml(section.name)}" data-si="${si}" class="section-input" placeholder="Section name" maxlength="100" />
          <button class="btn-close" data-action="remove-section" data-si="${si}">${lucideIcon("x")}</button>
        </div>
        <div class="rules-list">
          ${rulesHtml}
          <button class="btn-add" data-action="add-rule" data-si="${si}">+ Add rule</button>
        </div>
      </div>
    `;
        })
        .join("");

    el.querySelectorAll("textarea.rule-input").forEach(autoResize);
    el.oninput = handleInput;
    el.onclick = handleClick;
}

function handleInput(e) {
    const el = e.target;
    if (el.classList.contains("section-input")) {
        state.sections[+el.dataset.si].name = el.value;
    } else if (el.classList.contains("rule-input")) {
        state.sections[+el.dataset.si].rules[+el.dataset.ri].text = el.value;
        autoResize(el);
    }
}

function handleClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    e.preventDefault();
    const si = btn.dataset.si != null ? +btn.dataset.si : null;
    const ri = btn.dataset.ri != null ? +btn.dataset.ri : null;
    const action = btn.dataset.action;
    if (action === "add-rule") addRule(si);
    else if (action === "remove-rule") removeRule(si, ri);
    else if (action === "remove-section") removeSection(si);
}

function flushFields() {
    state.title = document.getElementById("rules-title")?.value ?? state.title;
    state.description =
        document.getElementById("rules-description")?.value ?? state.description;
}

function addSection() {
    flushFields();
    const nextId =
        state.sections.length > 0 ?
        Math.max(...state.sections.map((s) => s.id)) + 1 :
        1;
    state.sections.push({
        id: nextId,
        name: "New Section",
        rules: []
    });
    renderSections();
}

function removeSection(si) {
    state.sections.splice(si, 1);
    renderSections();
}

function addRule(si) {
    const section = state.sections[si];
    const nextId =
        section.rules.length > 0 ?
        Math.max(...section.rules.map((r) => r.id)) + 1 :
        1;
    section.rules.push({
        id: nextId,
        text: ""
    });
    renderSections();
}

function removeRule(si, ri) {
    state.sections[si].rules.splice(ri, 1);
    renderSections();
}

async function save() {
    flushFields();
    try {
        const res = await apiFetch("/api/rules?guild=" + getGuildId(), {
            method: "POST",
            body: JSON.stringify(state),
        });
        if (res.status === 401) {
            clearToken();
            return;
        }
        if (res.ok) {
            const data = await res.json();
            if (data.state) {
                state = data.state;
                renderSections();
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

export async function renderRules(el) {
    container = el;
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const guild = getGuildId();
    const [rulesRes, channelsRes] = await Promise.all([
        apiFetch("/api/rules?guild=" + guild).catch(() => null),
        apiFetch("/api/channels?guild=" + guild).catch(() => null),
    ]);

    if (rulesRes?.status === 401) {
        clearToken();
        return;
    }

    state = rulesRes?.ok ? await rulesRes.json() : null;
    if (!state) state = {
        title: "Server Rules",
        description: "",
        sections: []
    };
    if (!state.sections) state.sections = [];

    channels = channelsRes?.ok ? await channelsRes.json() : [];

    const channelOptions = [
        { value: "", label: "Unselected" },
        ...channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}`,
        })),
    ];

    const noChannels =
        channels.length === 0 ?
        `<p class="field-hint">No channels available!</p>` :
        `<p class="field-hint">Changing the channel will move the embeds to the new one.</p>`;

    container.innerHTML = `
    <div class="rules-layout">
      <div class="rules-left">
        <div class="card">
          <div class="card-header"><span>Channel</span></div>
          <div class="card-body">
            <div class="field">
              ${dropdownTemplate({ id: "channel-select", options: channelOptions, selectedValue: state.channelId ?? "", ariaLabel: "Select a rules channel", className: "dropdown-menu--field" })}
              ${noChannels}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span>Embed</span></div>
          <div class="card-body">
            <div class="field">
              <label class="settings-label">Title</label>
              <input type="text" id="rules-title" value="${decodeHtml(state.title)}" maxlength="256" />
            </div>
            <div class="field">
              <label class="settings-label">Description</label>
              <textarea id="rules-description" maxlength="4000">${decodeHtml(state.description ?? "")}</textarea>
            </div>
          </div>
        </div>

        <div class="actions">
          <span id="rules-status" class="status" style="display:none"></span>
          <button class="btn btn-ghost" id="discard-btn">Discard changes</button>
          <button class="btn btn-accent" id="save-btn">Save changes</button>
        </div>
      </div>

      <div class="rules-right">
        <div id="sections-container"></div>
        <button class="btn-add full" id="add-section-btn">+ Add section</button>
      </div>
    </div>
  `;

    renderSections();

    initializeDropdown(document.getElementById("channel-select"), channelOptions, (option) => {
        state.channelId = option.value || null;
    });

    const descEl = document.getElementById("rules-description");
    autoResize(descEl);
    descEl.addEventListener("input", () => autoResize(descEl));

    document.getElementById("add-section-btn").onclick = addSection;
    document.getElementById("save-btn").onclick = save;
    document.getElementById("discard-btn").onclick = () => renderRules(container);
}
