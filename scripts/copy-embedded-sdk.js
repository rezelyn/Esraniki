const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../node_modules/@discord/embedded-app-sdk/output');
const dest = path.join(__dirname, '../src/dashboard/public/shared/vendor/embedded-app-sdk');

if (!fs.existsSync(src)) {
    console.warn('[copy-embedded-sdk] @discord/embedded-app-sdk not found, skipping copy');
    process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[copy-embedded-sdk] Copied embedded-app-sdk browser build to public/shared/vendor/');
