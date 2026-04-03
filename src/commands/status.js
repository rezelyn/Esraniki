const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const color = require('../utils/style').color;
const emoji = require('../utils/style').emoji;
const format = require('../utils/style').format;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Affiche les statistiques hardware du bot'),
  
  async execute(interaction, client) {
    const cpu = cpuUsage();
    const latency = Date.now() - interaction.createdTimestamp;
    const uptime = format(process.uptime());
    const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalMB = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
    const node = process.version;
    const djs = require('discord.js').version;

    let status, c;
    if (cpu < 50) {
      status = 'Good';
      c = color.GREEN;
    } else if (cpu < 75) {
      status = 'OK';
      c = color.ORANGE;
    } else if (cpu >= 75) {
      status = 'Bad';
      c = color.RED;
    }

    const embed = new EmbedBuilder()
      .setColor(c)
      .addFields(
        { name: `${emoji.STATUS} Status`, value: status, inline: true },
        { name: `${emoji.LATENCY} Latency`, value: `${latency}ms`, inline: true },
        { name: `${emoji.UPTIME} Uptime`, value: uptime, inline: true },
        { name: `${emoji.CPU} CPU`, value: `${cpu}%`, inline: true },
        { name: `${emoji.MEMORY} Memory`, value: `${usedMB}MB / ${totalMB}MB`, inline: true },
        { name: `${emoji.VERSION} Framework`, value: `${node} / v${djs}`, inline: true }
      )
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
};

function cpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const totalUsage = 100 - Math.round((totalIdle / totalTick) * 100);
  return Math.max(0, Math.min(100, totalUsage));
}
