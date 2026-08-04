const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');
const { color, emoji, timestamp } = require('../utils/style');

const game = require('../app/games/shrimp');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shrimp')
        .setDescription('Shows informations about the Pass the Shrimp down game'),

    async execute(interaction) {
        try {
            const shrimp = game.getConfig(interaction.guildId);

            const embed = new EmbedBuilder()
                .setTitle('🦐 PASS THE SHRIMP')
                .setColor(color.ACCENT);

            const channelField = shrimp?.channelId ? `<#${shrimp.channelId}>` : 'Not configured';
            const gifField = shrimp?.gifUrl ?? 'Not configured';
            const total = shrimp?.totalPasses ?? 0;
            const today = shrimp?.todayPasses ?? 0;

            embed.addFields(
                {
                    name: `${emoji.MESSAGE} Channel`,
                    value: channelField,
                    inline: true
                },
                {
                    name: `${emoji.LINK} GIF`,
                    value: gifField,
                    inline: true
                },
                {
                    name: '\u200B',
                    value: '\u200B',
                    inline: false
                },
                {
                    name: `${emoji.LEADERBOARD} Total`,
                    value: `${total}`,
                    inline: true
                },
                {
                    name: `${emoji.TODAY} Today`,
                    value: `${today}`,
                    inline: true
                }
            );

            const todayUsers = game
                .getUsersOnCooldown(interaction.guildId)
                .map((u) => u.userId)
                .filter(Boolean);

            if (todayUsers.length) {
                let players = todayUsers
                    .slice(0, 25)
                    .map((id) => `- <@${id}>`)
                    .join('\n');

                if (todayUsers.length > 25) {
                    players += `\n+${todayUsers.length - 25} others...`;
                }

                embed.addFields({
                    name: `${emoji.USER} Members who've passed the shrimp today`,
                    value: players,
                    inline: false
                });
            }

            const remaining = game.getMsUntilReset(interaction.guildId);

            embed.setFooter({
                text: `Cooldown resets in: ${timestamp(Math.floor(remaining / 1000))}`,
            });

            if (shrimp?.gifUrl) {
                embed.setThumbnail(gifField);
            }

            return interaction.reply({
                embeds: [embed]
            });
        } catch (err) {
            handleError(err, 'Executing shrimp command', interaction);
            return;
        }
    }
};
