const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
} = require('discord.js');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');
const { color, emoji, timestamp } = require('../utils/style');

const game = require('../app/games/shrimp');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shrimp')
        .setDescription('Shows informations about the Pass the Shrimp down game')
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Set the default channel where the game would take place')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('gif')
                .setDescription('Set the default authorised GIF for the game')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const channel = interaction.options.getChannel('channel');
            const gif = interaction.options.getString('gif');

            if (!channel && !gif) {
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

                    const date = new Date();
                    const tz = shrimp.timezone || 'Europe/Paris';
                    const use24h = shrimp.use24h ?? false;
                    const time = new Intl.DateTimeFormat('en', {
                        timeZone: tz,
                        hour12: !use24h,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }).formatToParts(date).reduce((obj, part) => {
                        if (part.type === 'hour') obj.hour = parseInt(part.value, 10);
                        if (part.type === 'minute') obj.minute = parseInt(part.value, 10);
                        if (part.type === 'second') obj.second = parseInt(part.value, 10);
                        return obj;
                    }, {});

                    const elapsed = ((time.hour || 0) * 3600 + (time.minute || 0) * 60 + (time.second || 0)) * 1000 + date.getMilliseconds();
                    const remaining = Math.max(0, 86400000 - elapsed);

                    embed.setFooter({
                        text: `Cooldown resets in: ${timestamp(remaining)}`,
                    });

                    if (shrimp?.gifUrl) {
                        embed.setThumbnail(gifField);
                    }

                    return interaction.reply({
                        embeds: [embed]
                    });
                } catch (err) {
                    handleError(err, 'Fetching shrimp config', interaction);
                    return;
                }
            }

            const ownerId = process.env.OWNER_ID;
            const isOwner = ownerId && interaction.user.id === ownerId;

            const hasAdmin =
                interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
                interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);

            if (!isOwner && !hasAdmin) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⛔ ERROR')
                            .setDescription('You don\'t have permission to use this command.')
                            .setColor(color.RED)
                    ],
                    flag: 64
                });
            }

            const success = new EmbedBuilder()
                .setTitle('✅ SUCCESS')
                .setColor(color.GREEN);

            const summary = [];

            if (channel) {
                game.setChannel(interaction.guildId, channel.id);
                summary.push(`New channel set: ${channel}`);
            }

            if (gif) {
                if (gif.trim().toLowerCase() === 'none') {
                    game.setGif(interaction.guildId, null);
                    summary.push('Authorised GIF cleared');
                } else {
                    if (!/^https?:\/\//i.test(gif) || !/\.gif(\?|$)/i.test(gif)) {
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('⛔ ERROR')
                                    .setDescription('Invalid GIF URL.')
                                    .setColor(color.RED)
                            ],
                            flag: 64
                        });
                    }

                    game.setGif(interaction.guildId, gif);
                    success.setImage(gif);
                    summary.push('Authorised GIF updated');
                }
            }

            success.setDescription(summary.join('\n'));

            return interaction.reply({
                embeds: [success],
                flag: 64
            });
        } catch (err) {
            handleError(err, 'Executing shrimp command', interaction);
            return;
        }
    }
};
