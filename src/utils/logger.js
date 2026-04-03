const { gray, blue, orange, red, green, magenta } = require('colorette');
const isDebugEnabled = process.env.DEBUG === '1';

function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return gray(`[${hours}:${minutes}:${seconds}]`);
}

const logger = {
  info: (log) => {
    const timestamp = getTimestamp();
    const prefix = blue('[INFO]');
    console.log(`${timestamp} ${prefix} ${log}`);
  },

  warn: (log) => {
    const timestamp = getTimestamp();
    const prefix = orange('[WARN]');
    console.log(`${timestamp} ${prefix} ${log}`);
  },

  error: (log) => {
    const timestamp = getTimestamp();
    const prefix = red('[ERROR]');
    console.log(`${timestamp} ${prefix} ${log}`);
  },

  success: (log) => {
    const timestamp = getTimestamp();
    const prefix = green('[SUCCESS]');
    console.log(`${timestamp} ${prefix} ${log}`);
  },

  debug: (log) => {
    if (!isDebugEnabled) return;
    const timestamp = getTimestamp();
    const prefix = magenta('[DEBUG]');
    console.log(`${timestamp} ${prefix} ${log}`);
  }
};

module.exports = logger;
