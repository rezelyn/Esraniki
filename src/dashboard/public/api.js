let token = localStorage.getItem("esraniki_token") || "";
let guildId = localStorage.getItem("esraniki_guild") || "";

export function getToken() {
    return token;
}

export function getGuildId() {
    return guildId;
}

export function setGuildId(val) {
    guildId = val;
    localStorage.setItem("esraniki_guild", val);
}

export function setToken(val) {
    token = val;
    localStorage.setItem("esraniki_token", val);
}

export function clearToken() {
    localStorage.removeItem("esraniki_token");
    location.reload();
}

export async function apiFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
        },
    });
}
