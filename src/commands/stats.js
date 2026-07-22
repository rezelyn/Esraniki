const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require("discord.js");
const {
    load,
    leaderboard,
    userStats
} = require("../app/statistics");
const {
    color,
    emoji,
    timestamp
} = require("../utils/style");
const {
    locale,
    getLocalizations
} = require("../utils/lang");
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

const PERIODS = ["global", "today", "week", "month", "year"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Display server statistics")
        .setDescriptionLocalizations(getLocalizations("commands.stats.description"))
        .addUserOption((opt) =>
            opt
                .setName("user")
                .setDescription("Display statistics for a specific user")
                .setDescriptionLocalizations(getLocalizations("commands.stats.user"))
                .setRequired(false),
        ),

    async execute(interaction) {
        try {
            const target = interaction.options.getUser("user");
            const guildId = interaction.guildId;
            const data = load(guildId);

            if (target) {
                await interaction.reply(userEmbed(target, data, guildId, "global"));
            } else {
                await interaction.reply(globalEmbed(data, guildId, "global"));
            }
        } catch (error) {
            handleError(error, 'Error executing command stats', interaction);
        }
    },

    async handleSelect(interaction) {
        try {
            const parts = interaction.customId.split(":");
            const type = parts[1];
            const period = interaction.values[0];
            const guildId = interaction.guildId;
            const data = load(guildId);

            if (type === "global") {
                await interaction.update(globalEmbed(data, guildId, period));
            } else {
                const user = await interaction.client.users.fetch(parts[2]);
                await interaction.update(userEmbed(user, data, guildId, period));
            }
        } catch (error) {
            handleError(error, 'Error handling stats select', interaction);
        }
    },
};

function selectRow(userId, period, guildId) {
    const customId = userId ?
        `stats_period:user:${userId}` :
        "stats_period:global";
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(locale("stats.selectPeriod", {}, guildId))
        .addOptions(
            PERIODS.map((p) => ({
                label: locale(`stats.periods.${p}`, {}, guildId),
                value: p,
                default: p === period,
            })),
        ),
    );
}

function globalEmbed(data, guildId, period) {
    const messages = leaderboard(data, guildId, period, "messages").slice(0, 10);
    const vocal = leaderboard(data, guildId, period, "vocal").slice(0, 10);

    const messagesValue = messages.length ?
        messages
            .map((e, i) => `**${i + 1}.** <@${e.userId}>\n> ${e.count} messages`)
            .join("\n") :
        locale("stats.noData", {}, guildId);

    const vocalValue = vocal.length ?
        vocal
            .map((e, i) => `**${i + 1}.** <@${e.userId}>\n> ${timestamp(e.count)}`)
            .join("\n") :
        locale("stats.noData", {}, guildId);

    return {
        embeds: [
            new EmbedBuilder()
            .setColor(color.ESRANIKI)
            .setTitle(locale("stats.globalTitle", {}, guildId))
            .addFields({
                name: `${emoji.MESSAGE} ${locale("stats.topMessages", {}, guildId)}`,
                value: messagesValue,
                inline: true,
            }, {
                name: `${emoji.HEADSET} ${locale("stats.topVocal", {}, guildId)}`,
                value: vocalValue,
                inline: true,
            })
            .setFooter({
                text: locale(
                    "stats.periodFooter", {
                        period: locale(`stats.periods.${period}`, {}, guildId)
                    },
                    guildId,
                ),
            })
            .setTimestamp(),
        ],
        components: [selectRow(null, period, guildId)],
    };
}

function userEmbed(user, data, guildId, period) {
    const stats = userStats(data, user.id, period, guildId);
    const allMessages = leaderboard(data, guildId, period, "messages");
    const allVocal = leaderboard(data, guildId, period, "vocal");

    const msgRank = allMessages.findIndex((e) => e.userId === user.id);
    const vocalRank = allVocal.findIndex((e) => e.userId === user.id);

    return {
        embeds: [
            new EmbedBuilder()
            .setColor(color.ACCENT)
            .setTitle(locale("stats.userTitle", {
                user: user.displayName
            }, guildId))
            .setThumbnail(user.displayAvatarURL({
                size: 256
            }))
            .addFields({
                name: `${emoji.MESSAGE} ${locale("stats.messages", {}, guildId)}`,
                value: `${stats.messages}`,
                inline: true,
            }, {
                name: `${emoji.TROPHY} ${locale("stats.rank", {}, guildId)}`,
                value: msgRank >= 0 ? `#${msgRank + 1}` : locale("stats.rankNa", {}, guildId),
                inline: true,
            }, {
                name: "\u200B",
                value: "\u200B",
                inline: true
            }, {
                name: `${emoji.HEADSET} ${locale("stats.vocal", {}, guildId)}`,
                value: timestamp(stats.vocal),
                inline: true,
            }, {
                name: `${emoji.TROPHY} ${locale("stats.rank", {}, guildId)}`,
                value: vocalRank >= 0 ?
                    `#${vocalRank + 1}` :
                    locale("stats.rankNa", {}, guildId),
                inline: true,
            }, {
                name: "\u200B",
                value: "\u200B",
                inline: true
            })
            .setFooter({
                text: locale(
                    "stats.periodFooter", {
                        period: locale(`stats.periods.${period}`, {}, guildId)
                    },
                    guildId,
                ),
            })
            .setTimestamp(),
        ],
        components: [selectRow(user.id, period, guildId)],
    };
}
