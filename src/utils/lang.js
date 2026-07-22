const path = require("path");
const fs = require("fs");
const logger = require("./logger");
const { handleError } = require("./errorHandler");
const settings = require("./settings");

const supported = ["en_us", "fr_fr"];

let current = settings.get("language", "en_us");

const strings = {};
for (const locale of supported) {
    strings[locale] = require(path.join(__dirname, "../lang", `${locale}.json`));
}

function resolve(obj, key) {
    return key.split(".").reduce((o, k) => o?.[k], obj);
}

function guildSettingsFile(guildId) {
    return path.join(__dirname, "../../data", guildId, "settings.json");
}

function readGuildSettings(guildId) {
    try {
        const f = guildSettingsFile(guildId);
        if (!fs.existsSync(f)) return {};
        return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (err) {
        handleError(err, `Reading guild settings for ${guildId}`);
        return {};
    }
}

function writeGuildSettings(guildId, data) {
    try {
        const f = guildSettingsFile(guildId);
        fs.mkdirSync(path.dirname(f), {
            recursive: true
        });
        fs.writeFileSync(f, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, `Writing guild settings for ${guildId}`);
    }
}

function locale(key, vars = {}, guildId) {
    const locale = guildId ? getLanguage(guildId) : current;
    let value = resolve(strings[locale], key) ?? resolve(strings["en_us"], key);
    if (value === undefined) return key;
    return Object.entries(vars).reduce(
        (str, [k, v]) => str.replaceAll(`{${k}}`, v),
        value,
    );
}

function setLanguage(locale, guildId) {
    if (!supported.includes(locale))
        throw new Error(`Unsupported language: ${locale}`);
    if (guildId) {
        writeGuildSettings(guildId, {
            ...readGuildSettings(guildId),
            language: locale,
        });
        logger.info(`Language set to ${locale} for guild ${guildId}`);
        return;
    }
    current = locale;
    settings.set("language", locale);
    logger.info(`Global language set to ${locale}`);
}

function getLanguage(guildId) {
    if (guildId) return readGuildSettings(guildId).language ?? "en_us";
    return current;
}

const DISCORD_LOCALE = {
    en_us: "en-US",
    fr_fr: "fr",
};

function getLocalizations(key) {
    const result = {};
    for (const locale of supported) {
        const value = resolve(strings[locale], key);
        if (value !== undefined) result[DISCORD_LOCALE[locale]] = value;
    }
    return result;
}

function tGuild(guildId) {
    return (key, vars = {}) => locale(key, vars, guildId);
}

module.exports = {
    locale,
    tGuild,
    setLanguage,
    getLanguage,
    getLocalizations,
    supported,
};
