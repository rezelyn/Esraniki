const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { handleError } = require('../utils/errorHandler');
const { color, emoji, timestamp } = require('../utils/style');
const { locale, getLocalizations } = require('../utils/lang');

const { load, leaderboard, userStats } = require('../app/statistics');

const PERIODS = ['global', 'today', 'week', 'month', 'year'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Display server statistics')
        .setDescriptionLocalizations(getLocalizations('commands.stats.description'))
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('Display statistics for a specific user')
                .setDescriptionLocalizations(getLocalizations('commands.stats.user'))
                .setRequired(false),
        ),

    async execute(interaction) {
        try {
            const target = interaction.options.getUser('user');
            const guildId = interaction.guildId;
            const data = await load(guildId);

            if (target) {
                await interaction.reply(await userEmbed(target, data, guildId, 'global'),);
            } else {
                await interaction.reply(await globalEmbed(data, guildId, 'global'),);
            }
        } catch (error) {
            handleError(error, 'Error executing command stats', interaction);
        }
    },

    async handleSelect(interaction) {
        try {
            const parts = interaction.customId.split(':');
            const type = parts[1];
            const period = interaction.values[0];
            const guildId = interaction.guildId;
            const data = await load(guildId);

            if (type === 'global') {
                await interaction.update(await globalEmbed(data, guildId, period));
            } else {
                const user = await interaction.client.users.fetch(parts[2]);
                await interaction.update(await userEmbed(user, data, guildId, period));
            }
        } catch (error) {
            handleError(error, 'Error handling stats select', interaction);
        }
    },
};

async function selectRow(userId, period, guildId) {
    const customId = userId ? `stats_period:user:${userId}` : 'stats_period:global';
    const options = await Promise.all(
        PERIODS.map(async (current) => {
            const label = await locale(`stats.periods.${current}`, {}, guildId);
            return { label, value: current, default: current === period };
        })
    );
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(await locale('stats.selectPeriod', {}, guildId))
            .addOptions(options)
    );
}

async function globalEmbed(data, guildId, period) {
    const messages = leaderboard(data, guildId, period, 'messages').slice(0, 10);
    const vocal = leaderboard(data, guildId, period, 'vocal').slice(0, 10);

    const messagesValue = messages.length ? messages
        .map((element, index) => `**${index + 1}.** <@${element.userId}>\n> ${element.count} messages`)
        .join('\n') : await locale('stats.noData', {}, guildId);

    const vocalValue = vocal.length ? vocal
        .map((element, index) => `**${index + 1}.** <@${element.userId}>\n> ${timestamp(element.count)}`)
        .join('\n') : await locale('stats.noData', {}, guildId);

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(color.ACCENT)
                .setTitle(await locale('stats.globalTitle', {}, guildId))
                .addFields(
                    {
                        name: `${emoji.MESSAGE} ${await locale('stats.topMessages', {}, guildId)}`,
                        value: messagesValue,
                        inline: true
                    },
                    {
                        name: `${emoji.HEADSET} ${await locale('stats.topVocal', {}, guildId)}`,
                        value: vocalValue,
                        inline: true
                    }
                )
                .setFooter({
                    text: await locale(
                        'stats.periodFooter',
                        {
                            period: await locale(
                                `stats.periods.${period}`,
                                {},
                                guildId
                            )
                        },
                        guildId,
                    )
                })
                .setTimestamp()
        ],
        components: [await selectRow(null, period, guildId)]
    };
}

async function userEmbed(user, data, guildId, period) {
    const stats = userStats(data, user.id, period, guildId);
    const allMessages = leaderboard(data, guildId, period, 'messages');
    const allVocal = leaderboard(data, guildId, period, 'vocal');

    const msgRank = allMessages.findIndex((value) => value.userId === user.id);
    const vocalRank = allVocal.findIndex((value) => value.userId === user.id);

    const userTitle = await locale('stats.userTitle', {user: user.displayName}, guildId);
    const rankNa = await locale('stats.rankNa', {}, guildId);
    const periodLocale = await locale(`stats.periods.${period}`, {}, guildId);
    const messagesLabel = await locale('stats.messages', {}, guildId);
    const rankLabel = await locale('stats.rank', {}, guildId);
    const vocalLabel = await locale('stats.vocal', {}, guildId);
    const periodFooter = await locale('stats.periodFooter', { period: periodLocale }, guildId);

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(color.ACCENT)
                .setTitle(userTitle)
                .setThumbnail(
                    user.displayAvatarURL({
                        size: 256,
                    })
                )
                .addFields(
                    {
                        name: `${emoji.MESSAGE} ${messagesLabel}`,
                        value: `${stats.messages}`,
                        inline: true,
                    },
                    {
                        name: `${emoji.TROPHY} ${rankLabel}`,
                        value: msgRank >= 0 ? `#${msgRank + 1}` : rankNa,
                        inline: true
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    },
                    {
                        name: `${emoji.HEADSET} ${vocalLabel}`,
                        value: timestamp(stats.vocal),
                        inline: true
                    },
                    {
                        name: `${emoji.TROPHY} ${rankLabel}`,
                        value: vocalRank >= 0 ? `#${vocalRank + 1}` : rankNa,
                        inline: true
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    }
                )
                .setFooter({
                    text: periodFooter
                })
                .setTimestamp()
        ],
        components: [await selectRow(user.id, period, guildId)]
    };
}
