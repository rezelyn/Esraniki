module.exports = {
  color: {
    ESRANIKI: 0xD52146,
    GREEN: 0xC1EBC0,
    ORANGE: 0xF6CA94,
    RED: 0xF09EA7,
    GRAY: 0xCFCFC4
  },
  emoji: {
    CPU: '<:cpu:1489428532852686888>',
    HEADSET: '<:headset:1489620222641180712>',
    LATENCY: '<:latency:1489428529320820776>',
    LIST: '<:list:1489614105554718892>',
    MEMORY: '<:memory:1489428530285772860>',
    MESSAGE: '<:message:1489620223601414289>',
    STATUS: '<:status:1489428527265878196>',
    TROPHY: '<:trophy:1489620903783563505>',
    UPTIME: '<:uptime:1489428531254525982>',
    USER: '<:user:1489614106565808300>',
    VERSION: '<:version:1489428528272375951>'
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

    return parts.join(' ');
  }
};
