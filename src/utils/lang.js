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

async function readGuildSettings(guildId) {
    try {
        const f = guildSettingsFile(guildId);
        try {
            await fs.promises.access(f);
            const data = await fs.promises.readFile(f, "utf8");
            return JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return {};
            }
            throw err;
        }
    } catch (err) {
        handleError(err, `Reading guild settings for ${guildId}`);
        return {};
    }
}

async function writeGuildSettings(guildId, data) {
    try {
        const f = guildSettingsFile(guildId);
        await fs.promises.mkdir(path.dirname(f), { recursive: true });
        await fs.promises.writeFile(f, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, `Writing guild settings for ${guildId}`);
    }
}

async function locale(key, vars = {}, guildId) {
    const locale = guildId ? await getLanguage(guildId) : current;
    let value = resolve(strings[locale], key) ?? resolve(strings["en_us"], key);
    if (value === undefined) return key;
    return Object.entries(vars).reduce(
        (str, [k, v]) => str.replaceAll(`{${k}}`, v),
        value,
    );
}

async function setLanguage(locale, guildId) {
    if (!supported.includes(locale))
        throw new Error(`Unsupported language: ${locale}`);
    if (guildId) {
        await writeGuildSettings(guildId, {
            ...(await readGuildSettings(guildId)),
            language: locale,
        });
        logger.info(`Language set to ${locale} for guild ${guildId}`);
        return;
    }
    current = locale;
    settings.set("language", locale);
    logger.info(`Global language set to ${locale}`);
}

async function getLanguage(guildId) {
    if (guildId) return (await readGuildSettings(guildId)).language ?? "en_us";
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
