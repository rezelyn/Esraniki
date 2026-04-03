const { gray, blue, yellow, red, green, magenta } = require('colorette');

function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return gray(`[${hours}:${minutes}:${seconds}]`);
}

const logger = {
  info: (message) => {
    const timestamp = getTimestamp();
    const label = blue('[INFO]');
    console.log(`${timestamp} ${label} ${message}`);
  },

  warn: (message) => {
    const timestamp = getTimestamp();
    const label = yellow('[WARN]');
    console.log(`${timestamp} ${label} ${message}`);
  },

  error: (message) => {
    const timestamp = getTimestamp();
    const label = red('[ERROR]');
    console.log(`${timestamp} ${label} ${message}`);
  },

  success: (message) => {
    const timestamp = getTimestamp();
    const label = green('[SUCCESS]');
    console.log(`${timestamp} ${label} ${message}`);
  },

  debug: (message) => {
    if (process.env.DEBUG !== 'true') return;
    const timestamp = getTimestamp();
    const label = magenta('[DEBUG]');
    console.log(`${timestamp} ${label} ${message}`);
  }
};

module.exports = logger;
