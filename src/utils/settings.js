const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { handleError } = require('./errorHandler');

const file = path.join(__dirname, '../../data/settings.json');

function load() {
    try {
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        handleError(err, 'Loading settings');
        return {};
    }
}

function save(data) {
    try {
        fs.mkdirSync(path.dirname(file), {
            recursive: true
        });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (err) {
        handleError(err, 'Saving settings');
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
