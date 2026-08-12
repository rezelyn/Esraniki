const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function migrateGuild(guildId) {
    const legacyFile = path.join(DATA_DIR, guildId, 'stats.json');
    if (!fs.existsSync(legacyFile)) return null;

    let data;
    try {
        data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    } catch (err) {
        console.error(`[migrate-stats] Failed to parse ${legacyFile}: ${err.message}`);
        return null;
    }

    const statsDir = path.join(DATA_DIR, guildId, 'statistics');
    fs.mkdirSync(statsDir, { recursive: true });

    let migrated = 0;
    let skipped = 0;

    for (const [userId, userData] of Object.entries(data)) {
        const target = path.join(statsDir, `${userId}.json`);
        if (fs.existsSync(target)) {
            skipped++;
            continue;
        }
        fs.writeFileSync(target, JSON.stringify(userData, null, 2));
        migrated++;
    }

    const backupFile = `${legacyFile}.bak`;
    fs.renameSync(legacyFile, backupFile);

    return { guildId, migrated, skipped, backupFile };
}

function main() {
    if (!fs.existsSync(DATA_DIR)) {
        console.log('[migrate-stats] No "data" directory found, nothing to migrate.');
        return;
    }

    const guildDirs = fs
        .readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    if (guildDirs.length === 0) {
        console.log('[migrate-stats] No guild directories found, nothing to migrate.');
        return;
    }

    console.log(`[migrate-stats] Scanning ${guildDirs.length} guild director${guildDirs.length !== 1 ? 'ies' : 'y'} for legacy "stats.json" files...`);

    let touchedGuilds = 0;

    for (const guildId of guildDirs) {
        const result = migrateGuild(guildId);
        if (!result) continue;

        touchedGuilds++;
        const skippedNote = result.skipped ? `, skipped ${result.skipped} (already present)` : '';
        console.log(`[migrate-stats] Guild ${guildId}: migrated ${result.migrated} user file${result.migrated !== 1 ? 's' : ''}${skippedNote}. Backed up old file to ${path.relative(process.cwd(), result.backupFile)}`);
    }

    if (touchedGuilds === 0) {
        console.log('[migrate-stats] No legacy stats.json files found. Nothing to do, you can ignore this.');
    } else {
        console.log(`[migrate-stats] Done. Migrated ${touchedGuilds} guild${touchedGuilds !== 1 ? 's' : ''}.`);
    }
}

main();
