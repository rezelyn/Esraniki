const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { handleError } = require("./errorHandler");

const settingsFile = path.join(__dirname, "../../data/settings.json");

function load() {
    try {
        if (!fs.existsSync(settingsFile)) return {};
        return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch (err) {
        handleError(err, "Loading settings");
        return {};
    }
}

function save(data) {
    try {
        fs.mkdirSync(path.dirname(settingsFile), {
            recursive: true
        });
        fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, "Saving settings");
    }
}

function get(key, defaultValue) {
    return load()[key] ?? defaultValue;
}

function set(key, value) {
    save({
        ...load(),
        [key]: value
    });
}

module.exports = {
    get,
    set
};
