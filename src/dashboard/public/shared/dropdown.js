function decodeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function optionContent(option) {
    return option.html ?? decodeHtml(option.label);
}

function icon(iconURL, className) {
    if (iconURL) {
        return `<img src="${decodeHtml(iconURL)}" alt="" class="${className}" />`;
    }
    return "";
}

export function dropdownTemplate({
    id,
    options,
    selectedValue,
    ariaLabel = "Select an option",
    className = ""
}) {
    const selected =
        options.find((option) => String(option.value) === String(selectedValue),) ??
        options.find((option) => !option.disabled) ??
        options[0];
    const hasIcons = options.some((option) => option.iconURL);

    return `
        <div class="dropdown-menu ${className}" id="${decodeHtml(id)}" data-dropdown>
            <button class="dropdown-menu-btn" type="button" data-dropdown-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="${decodeHtml(ariaLabel)}" aria-controls="${decodeHtml(id)}-list">
                ${hasIcons ? `<span class="dropdown-menu-icon-wrap" data-dropdown-icon>${icon(selected?.iconURL, "dropdown-menu-icon")}</span>` : ""}
                <span class="dropdown-menu-label" data-dropdown-label>${selected ? optionContent(selected) : ""}</span>
            </button>
            <div class="dropdown-menu-list" id="${decodeHtml(id)}-list" data-dropdown-list role="listbox">
                ${options.map((option) => `
                    <button class="dropdown-menu-item${String(option.value) === String(selected?.value) ? " active " : " "}" type="button" data-dropdown-option data-dropdown-value="${decodeHtml(option.value)}" role="option" aria-selected="${String(option.value) === String(selected?.value)}"
                    ${option.disabled ? ' disabled aria-disabled="true"' : ""}>
                        ${hasIcons ? `<span class="dropdown-menu-item-icon-wrap">${icon(option.iconURL, "dropdown-menu-item-icon")}</span>` : ""}
                        <span>${optionContent(option)}</span>
                    </button>
                `,
                )
                .join("")}
            </div>
        </div>
    `;
}

export function closeDropdowns(except) {
    document.querySelectorAll("[data-dropdown]").forEach((dropdown) => {
        if (dropdown !== except) setDropdownOpen(dropdown, false);
    });
}

export function setDropdownOpen(dropdown, isOpen) {
    const list = dropdown?.querySelector("[data-dropdown-list]");
    const trigger = dropdown?.querySelector("[data-dropdown-trigger]");
    if (!list || !trigger) return;
    list.classList.toggle("open", isOpen);
    trigger.setAttribute("aria-expanded", String(isOpen));
}

export function initializeDropdown(dropdown, options, onSelect) {
    if (!dropdown) return null;
    const optionsByValue = new Map(options.map((option) => [String(option.value), option]));
    const trigger = dropdown.querySelector("[data-dropdown-trigger]");
    const label = dropdown.querySelector("[data-dropdown-label]");
    const icon = dropdown.querySelector("[data-dropdown-icon]");
    let selectedValue = dropdown.querySelector("[data-dropdown-option].active") ?.dataset.dropdownValue;

    function setSelected(value) {
        const option = optionsByValue.get(String(value));
        if (!option) return;
        selectedValue = String(option.value);

        if (label) label.innerHTML = optionContent(option);
        if (icon) icon.innerHTML = icon(option.iconURL, "dropdown-menu-icon");

        dropdown.querySelectorAll("[data-dropdown-option]").forEach((item) => {
            const selected =
                item.dataset.dropdownValue === String(option.value);
                item.classList.toggle("active", selected);
                item.setAttribute("aria-selected", String(selected));
        });
    }

    trigger?.addEventListener("click", () => {
        const willOpen = !dropdown.querySelector("[data-dropdown-list]") ?.classList.contains("open");
        closeDropdowns(dropdown);
        setDropdownOpen(dropdown, willOpen);
    });

    dropdown.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-dropdown-option]");
        if (!item || !dropdown.contains(item)) return;
        const option = optionsByValue.get(item.dataset.dropdownValue);
        if (!option || option.disabled) return;
        setSelected(option.value);
        setDropdownOpen(dropdown, false);
        await onSelect?.(option, { setSelected });
    });

    dropdown.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setDropdownOpen(dropdown, false);
            trigger?.focus();
            return;
        }

        if (!trigger || !["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "]
            .includes( event.key ))
            return;

        event.preventDefault();
        const enabledOptions = options.filter((option) => !option.disabled);
        if (!enabledOptions.length) return;
        const currentIndex = enabledOptions.findIndex((option) => String(option.value) === selectedValue);

        if (event.key === "Enter" || event.key === " ") {
            trigger.click();
            return;
        }

        let nextIndex = currentIndex < 0 ? 0 : currentIndex;

        if (event.key === "ArrowDown")
            nextIndex = (nextIndex + 1) % enabledOptions.length;

        if (event.key === "ArrowUp")
            nextIndex = (nextIndex - 1 + enabledOptions.length) % enabledOptions.length;

        if (event.key === "Home")
            nextIndex = 0;

        if (event.key === "End")
            nextIndex = enabledOptions.length - 1;
        
        const nextOption = enabledOptions[nextIndex];
        setSelected(nextOption.value);
        onSelect?.(nextOption, { setSelected });
    });

    return {
        setSelected,
        getSelectedValue: () => selectedValue,
        close: () => setDropdownOpen(dropdown, false)
    };
}

document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dropdown]")) closeDropdowns();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDropdowns();
});
