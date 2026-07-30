import { apiFetch, clearToken, getGuildId } from "../backend/api.js";
import { dropdownTemplate, initializeDropdown } from "../shared/dropdown.js";
import { decodeHtml, lucideIcon } from "../shared/style.js";

let state = null;
let channels = [];
let container = null;
let statusTimer = null;

function showStatus(message, type) {
    const element = document.getElementById("rules-status");
    if (!element) return;

    element.textContent = message;
    element.className = "status " + type;
    element.style.display = "inline-block";

    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        element.classList.add("hiding");
        element.addEventListener("animationend",() =>
            {
                element.style.display = "none";
            },
            {
                once: true
            }
        );
    }, 3000);
}

function autoResize(page) {
    page.style.height = "auto";
    page.style.height = page.scrollHeight + "px";
}

function renderSections() {
    const element = document.getElementById("sections-container");
    if (!element) return;

    element.innerHTML = state.sections
        .map((section, si) => {
            const rulesHtml = section.rules
                .map(
                    (rule, ri) => `
                        <div class="rule-row">
                            <span class="rule-num">${section.id}.${rule.id}.</span>
                            <textarea class="rule-input" data-si="${si}" data-ri="${ri}" placeholder="Rule text" rows="1">${decodeHtml(rule.text)}</textarea>
                            <button class="btn danger small" data-action="remove-rule" data-si="${si}" data-ri="${ri}">${lucideIcon("x", "icon")}</button>
                        </div>
                    `,
                )
                .join("");

            return `
                <div class="section">
                    <div class="section-head">
                        <span class="section-num">${section.id}.</span>
                        <input type="text" value="${decodeHtml(section.name)}" data-si="${si}" class="section-input" placeholder="Section name" maxlength="100" />
                        <button class="btn danger xs" data-action="remove-section" data-si="${si}">${lucideIcon("trash", "icon")}</button>
                    </div>
                    <div class="rules-list">
                        ${rulesHtml}
                        <button class="btn full dotted" data-action="add-rule" data-si="${si}">
                            <label class="label-hint">+ Add rule</label>
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");

    element.querySelectorAll("textarea.rule-input").forEach(autoResize);
    element.oninput = handleInput;
    element.onclick = handleClick;
}

function handleInput(event) {
    const element = event.target;
    if (element.classList.contains("section-input")) {
        state.sections[+element.dataset.si].name = element.value;
    } else if (element.classList.contains("rule-input")) {
        state.sections[+element.dataset.si].rules[+element.dataset.ri].text = element.value;
        autoResize(element);
    }
}

function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    event.preventDefault();

    const si = button.dataset.si != null ? +button.dataset.si : null;
    const ri = button.dataset.ri != null ? +button.dataset.ri : null;
    const action = button.dataset.action;

    if (action === "add-rule") addRule(si);
    else if (action === "remove-rule") removeRule(si, ri);
    else if (action === "remove-section") removeSection(si);
}

function flushFields() {
    state.title = document.getElementById("rules-title")?.value ?? state.title;
    state.description = document.getElementById("rules-description")?.value ?? state.description;
}

function addSection() {
    flushFields();
    const nextId = state.sections.length > 0 ? Math.max(...state.sections.map((section) => section.id)) + 1 : 1;
    state.sections.push({
        id: nextId,
        name: "",
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
    const nextId = section.rules.length > 0 ? Math.max(...section.rules.map((rule) => rule.id)) + 1 : 1;
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
        const response = await apiFetch("/api/rules?guild=" + getGuildId(), {
            method: "POST",
            body: JSON.stringify(state)
        });

        if (response.status === 401) {
            clearToken();
            return;
        }

        if (response.ok) {
            const data = await response.json();
            if (data.state) {
                state = data.state;
                renderSections();
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

export async function renderRules(el) {
    container = el;
    container.innerHTML = `<div id="home-body"><div class="spinner"></div></div>`;

    const guild = getGuildId();
    const [resolveRules, resolveChannels] = await Promise.all([
        apiFetch("/api/rules?guild=" + guild).catch(() => null),
        apiFetch("/api/channels?guild=" + guild).catch(() => null)
    ]);

    if (resolveRules?.status === 401) {
        clearToken();
        return;
    }

    state = resolveRules?.ok ? await resolveRules.json() : null;
    if (!state) state = {
        title: "Server Rules",
        description: "",
        sections: []
    };

    if (!state.sections) state.sections = [];

    channels = resolveChannels?.ok ? await resolveChannels.json() : [];

    const channelOptions = [{ value: "", label: "Select a channel" },
        ...channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}`
        }))
    ];

    container.innerHTML = `
        <div class="rules-layout">
            <div class="rules-left">
                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("message-square", "icon")} Channel</label>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Discord Channel</label>
                            ${dropdownTemplate({ id: "rules-channel", options: channelOptions, selectedValue: state.channelId ?? "", ariaLabel: "Select a rules channel", className: "dropdown-menu--field" })}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <label class="label-header">${lucideIcon("layout-template", "icon")} Embed</label>
                    </div>
                    <div class="card-body">
                        <div class="field">
                            <label class="label-option">Title</label>
                            <input type="text" id="rules-title" placeholder="My Server Rules" value="${decodeHtml(state.title)}" maxlength="256" />
                        </div>
                        <div class="field">
                            <label class="label-option">Description</label>
                            <textarea id="rules-description" placeholder="This are the rules, please read them!" maxlength="4000">${decodeHtml(state.description ?? "")}</textarea>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <span id="rules-status" class="status" style="display:none"></span>
                    <button class="btn secondary" id="discard-btn">Discard changes</button>
                    <button class="btn primary" id="save-btn">Save changes</button>
                </div>
            </div>

            <div class="rules-right">
                <div id="sections-container"></div>
                <button class="btn full dotted" type="dotted" id="add-section-btn">
                    <label class="label-hint">+ Add section</label>
                </button>
            </div>
        </div>
    `;

    renderSections();

    initializeDropdown(
        document.getElementById("rules-channel"),
        channelOptions, (option) => { state.channelId = option.value || null; }
    );

    const element = document.getElementById("rules-description");
    autoResize(el);

    el.addEventListener("input", () => autoResize(el));

    document.getElementById("add-section-btn").onclick = addSection;
    document.getElementById("save-btn").onclick = save;
    document.getElementById("discard-btn").onclick = () => renderRules(container);
}
