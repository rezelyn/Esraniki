const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/errorHandler');
const { color, emoji, timestamp } = require('../utils/style');
const { locale, guildLocale, getLocalizations } = require('../utils/lang');

const game = require('../app/games/shrimp');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shrimp')
        .setDescription('Shows informations about the Pass the Shrimp down game')
        .setDescriptionLocalizations(getLocalizations('commands.shrimp.description')),

    async execute(interaction) {
        try {
            const guildId = interaction.guildId;
            const localeForGuild = guildLocale(guildId);
            const shrimp = game.getConfig(guildId);

            const embed = new EmbedBuilder()
                .setTitle(await localeForGuild('shrimp.title'))
                .setColor(color.ACCENT);

            const channelField = shrimp?.channelId ? `<#${shrimp.channelId}>` : await localeForGuild('generic.notConfigured');
            const gifField = shrimp?.gifUrl ?? await localeForGuild('generic.notConfigured');
            const total = shrimp?.totalPasses ?? 0;
            const today = shrimp?.todayPasses ?? 0;

            const channelLabel = await localeForGuild('generic.textChannel');
            const totalLabel = await localeForGuild('generic.textTotal');
            const todayLabel = await localeForGuild('stats.periods.today');
            const othersLabel = await localeForGuild('generic.textOthers');
            const passedLabel = await localeForGuild('shrimp.passed');
            const cooldownLabel = await localeForGuild('shrimp.cooldown');

            embed.addFields(
                {
                    name: `${emoji.MESSAGE} ${channelLabel}`,
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
                    name: `${emoji.LEADERBOARD} ${totalLabel}`,
                    value: `${total}`,
                    inline: true
                },
                {
                    name: `${emoji.TODAY} ${todayLabel}`,
                    value: `${today}`,
                    inline: true
                }
            );

            const todayUsers = game
                .getUsersOnCooldown(guildId)
                .map((u) => u.userId)
                .filter(Boolean);

            if (todayUsers.length) {
                let players = todayUsers
                    .slice(0, 25)
                    .map((id) => `- <@${id}>`)
                    .join('\n');

                if (todayUsers.length > 25) {
                    players += `\n+${todayUsers.length - 25} ${othersLabel}`;
                }

                embed.addFields({
                    name: `${emoji.USER} ${passedLabel}`,
                    value: players,
                    inline: false
                });
            }

            const remaining = game.getMsUntilReset(guildId);

            embed.setFooter({
                text: `${cooldownLabel} ${timestamp(Math.floor(remaining / 1000))}`,
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
