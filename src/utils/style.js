module.exports = {
    color: {
        ACCENT:    0xd52146,
        ROSEWATER: 0xf5e0dc,
        FLAMINGO:  0xf2cdcd,
        PINK:      0xf5c2e7,
        MAUVE:     0xcba6f7,
        RED:       0xf09ea7,
        MAROON:    0xeba0ac,
        PEACH:     0xfab387,
        YELLOW:    0xf9e2af,
        GREEN:     0xc1ebc0,
        TEAL:      0x94e2d5,
        SKY:       0x89dceb,
        SAPPHIRE:  0x74c7ec,
        BLUE:      0x89b4fa,
        LAVENDER:  0xb4befe,
        TEXT:      0xcdd6f4,
        SUBTEXT1:  0xbac2de,
        SUBTEXT0:  0xa6adc8,
        OVERLAY2:  0x9399b2,
        OVERLAY1:  0x7f849c,
        OVERLAY0:  0x6c7086,
        SURFACE2:  0x585b70,
        SURFACE1:  0x45475a,
        SURFACE0:  0x313244,
        BASE:      0x1e1e2e,
        MANTLE:    0x181825,
        CRUST:     0x11111b,
    },
    emoji: {
        CPU:           "<:cpu:1489428532852686888>",
        DELETE:        "<:delete:1525891445834125333>",
        HEADSET:       "<:headset:1489620222641180712>",
        LATENCY:       "<:latency:1489428529320820776>",
        LEADERBOARD:   "<:leaderboard:1526255941635408062>",
        LINK:          "<:link:1526255943812120746>",
        LIST:          "<:list:1489614105554718892>",
        MEMORY:        "<:memory:1489428530285772860>",
        MESSAGE:       "<:message:1489620223601414289>",
        PAUSE:         "<:pause:1525891307925410014>",
        PLAY:          "<:play:1525891308923785419>",
        QUEUE:         "<:queue:1525891447277092965>",
        REPEAT:        "<:repeat:1525891348895367349>",
        SHUFFLE:       "<:shuffle:1525891350074232883>",
        SKIP_NEXT:     "<:skip_next:1525891225750868089>",
        SKIP_PREVIOUS: "<:skip_previous:1525891224182067300>",
        STATUS:        "<:status:1489428527265878196>",
        STOP:          "<:stop:1525891309867368621>",
        TODAY:         "<:today:1526255942843498718>",
        TROPHY:        "<:trophy:1489620903783563505>",
        UPTIME:        "<:uptime:1489428531254525982>",
        USER:          "<:user:1489614106565808300>",
        VERSION:       "<:version:1489428528272375951>",
        VOLUME_DOWN:   "<:volume_down:1525891400233652357>",
        VOLUME_OFF:    "<:volume_off:1525891397314416680>",
        VOLUME_UP:     "<:volume_up:1525891398417518722>"
    },
    format(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        const secs = Math.floor(seconds % 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(" ");
    },
};
