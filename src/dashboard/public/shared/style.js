export const TWEMOJI =
    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.3/assets/svg";
export const LANG_FLAGS = {
    en_us: `<img src="${TWEMOJI}/1f1fa-1f1f8.svg" class="lang-flag" alt="US" /> English`,
    fr_fr: `<img src="${TWEMOJI}/1f1eb-1f1f7.svg" class="lang-flag" alt="FR" /> French`,
};

export function decodeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function lucideIcon(Icon, Class = "") {
    return `<i data-lucide="${Icon}" class="${Class}"></i>`;
}

export function timestamp(int) {
    const d = Math.floor(int / 86400);
    const h = Math.floor((int % 86400) / 3600);
    const m = Math.floor((int % 3600) / 60);
    const s = Math.floor(int % 60);
    const time = [];
    if (d) time.push(d + "d");
    if (h) time.push(h + "h");
    if (m) time.push(m + "m");
    if (s || !time.length) time.push(s + "s");
    return time.join(" ");
}
