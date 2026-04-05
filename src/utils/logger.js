const { gray, blue, yellow, red, green, magenta } = require("colorette");

const logBuffer = [];
let logId = 0;

function pushLog(level, message) {
  const entry = { id: ++logId, time: new Date().toISOString(), level, message };
  logBuffer.push(entry);
  if (logBuffer.length > 500) logBuffer.shift();
}

function getLogs(since = 0) {
  return logBuffer.filter((e) => e.id > since);
}

function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return gray(`[${hours}:${minutes}:${seconds}]`);
}

const logger = {
  info: (message) => {
    pushLog("info", message);
    console.log(`${getTimestamp()} ${blue("[INFO]")} ${message}`);
  },

  warn: (message) => {
    pushLog("warn", message);
    console.log(`${getTimestamp()} ${yellow("[WARN]")} ${message}`);
  },

  error: (message) => {
    pushLog("error", message);
    console.log(`${getTimestamp()} ${red("[ERROR]")} ${message}`);
  },

  success: (message) => {
    pushLog("success", message);
    console.log(`${getTimestamp()} ${green("[SUCCESS]")} ${message}`);
  },

  debug: (message) => {
    if (!require("./settings").get("debug", false)) return;
    pushLog("debug", message);
    console.log(`${getTimestamp()} ${magenta("[DEBUG]")} ${message}`);
  },

  getLogs,
};

module.exports = logger;
