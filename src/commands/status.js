const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");
const os = require("os");
const color = require("../utils/style").color;
const emoji = require("../utils/style").emoji;
const timestamp = require("../utils/style").timestamp;
const {
    locale,
    tGuild,
    getLocalizations
} = require("../utils/lang");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show the current status of the bot")
        .setDescriptionLocalizations(
            getLocalizations("commands.status.description"),
        ),

    async execute(interaction, client) {
        const locale = tGuild(interaction.guildId);
        const cpu = cpuUsage();
        const latency = Date.now() - interaction.createdTimestamp;
        const uptime = timestamp(process.uptime());
        const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMB = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
        const node = process.version;
        const djs = require("discord.js").version;

        let status, c;
        if (cpu < 50) {
            status = locale("status.good");
            c = color.GREEN;
        } else if (cpu < 75) {
            status = locale("status.ok");
            c = color.ORANGE;
        } else if (cpu >= 75) {
            status = locale("status.bad");
            c = color.RED;
        }

        const embed = new EmbedBuilder().setColor(c).addFields({
            name: `${emoji.STATUS} ${locale("status.fields.status")}`,
            value: status,
            inline: true,
        }, {
            name: `${emoji.LATENCY} ${locale("status.fields.latency")}`,
            value: `${latency}ms`,
            inline: true,
        }, {
            name: `${emoji.UPTIME} ${locale("status.fields.uptime")}`,
            value: uptime,
            inline: true,
        }, {
            name: `${emoji.CPU} ${locale("status.fields.cpu")}`,
            value: `${cpu}%`,
            inline: true,
        }, {
            name: `${emoji.MEMORY} ${locale("status.fields.memory")}`,
            value: `${usedMB}MB / ${totalMB}MB`,
            inline: true,
        }, {
            name: `${emoji.VERSION} ${locale("status.fields.framework")}`,
            value: `${node} / v${djs}`,
            inline: true,
        }, );

        await interaction.reply({
            embeds: [embed],
            flags: 64
        });
    },
};

function cpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });

    const totalUsage = 100 - Math.round((totalIdle / totalTick) * 100);
    return Math.max(0, Math.min(100, totalUsage));
}
