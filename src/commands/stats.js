const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { load, leaderboard, userStats } = require('../utils/statistics');
const { color, emoji, format } = require('../utils/style');

const PERIODS = [
  { label: 'Global', value: 'global' },
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Display server statistics')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Display statistics for a specific user').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const data = load();
    const guildId = interaction.guildId;

    if (target) {
      await interaction.reply(userEmbed(target, data, guildId, 'global'));
    } else {
      await interaction.reply(globalEmbed(data, guildId, 'global'));
    }
  },

  async handleSelect(interaction) {
    const parts = interaction.customId.split(':');
    const type = parts[1];
    const period = interaction.values[0];
    const data = load();
    const guildId = interaction.guildId;

    if (type === 'global') {
      await interaction.update(globalEmbed(data, guildId, period));
    } else {
      const user = await interaction.client.users.fetch(parts[2]);
      await interaction.update(userEmbed(user, data, guildId, period));
    }
  }
};

function selectRow(userId, period) {
  const customId = userId ? `stats_period:user:${userId}` : 'stats_period:global';
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select a period')
      .addOptions(PERIODS.map(p => ({ ...p, default: p.value === period })))
  );
}

function globalEmbed(data, guildId, period) {
  const messages = leaderboard(data, guildId, period, 'messages').slice(0, 10);
  const vocal = leaderboard(data, guildId, period, 'vocal').slice(0, 10);
  const periodLabel = PERIODS.find(p => p.value === period).label;

  const messagesValue = messages.length
    ? messages.map((e, i) => `**${i + 1}.** <@${e.userId}>\n> ${e.count} messages`).join('\n')
    : 'No data';

  const vocalValue = vocal.length
    ? vocal.map((e, i) => `**${i + 1}.** <@${e.userId}>\n> ${format(e.count)}`).join('\n')
    : 'No data';

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(color.ESRANIKI)
        .setTitle('Global Statistics')
        .addFields(
          { name: `${emoji.MESSAGE} Top Messages`, value: messagesValue, inline: true },
          { name: `${emoji.HEADSET} Top Vocal`, value: vocalValue, inline: true }
        )
        .setFooter({ text: `Period: ${periodLabel}` })
        .setTimestamp()
    ],
    components: [selectRow(null, period)]
  };
}

function userEmbed(user, data, guildId, period) {
  const stats = userStats(data, guildId, user.id, period);
  const allMessages = leaderboard(data, guildId, period, 'messages');
  const allVocal = leaderboard(data, guildId, period, 'vocal');
  const periodLabel = PERIODS.find(p => p.value === period).label;

  const msgRank = allMessages.findIndex(e => e.userId === user.id);
  const vocalRank = allVocal.findIndex(e => e.userId === user.id);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(color.ESRANIKI)
        .setTitle(`${user.displayName}'s Statistics`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: `${emoji.MESSAGE} Messages`, value: `${stats.messages}`, inline: true },
          { name: `${emoji.TROPHY} Rank`, value: msgRank >= 0 ? `#${msgRank + 1}` : 'N/A', inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: `${emoji.HEADSET} Vocal`, value: format(stats.vocal), inline: true},
          { name: `${emoji.TROPHY} Rank`, value: vocalRank >= 0 ? `#${vocalRank + 1}` : 'N/A', inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        )
        .setFooter({ text: `Period: ${periodLabel}` })
        .setTimestamp()
    ],
    components: [selectRow(user.id, period)]
  };
}
