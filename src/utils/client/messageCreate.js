const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../errorHandler');
const { color, timestamp } = require('../style');
const { locale, getLocalizations } = require('../lang');

const { trackMessage } = require('../../app/statistics');
const game = require('../../app/games/shrimp');
const { moderateMessage } = require('../../app/player/discord');

module.exports = async (message) => {
    if (!message.guild) return;

    try {
        const playerChannel = await moderateMessage(message);
        if (message.author.bot) return;
        await trackMessage(message.guild.id, message.author.id);
        if (playerChannel) return;
        const shrimp = game.getConfig(message.guild.id);
        if (!shrimp || !shrimp.channelId) return;
        if (message.channel.id !== shrimp.channelId) return;

        const hasGif =
            shrimp.gifUrl &&
            (message.content.includes(shrimp.gifUrl) ||
                (message.attachments &&
                    Array.from(message.attachments.values()).some(
                        (data) => data.url && data.url.includes('.gif')
                    )
                )
            );

        if (hasGif) {
            if (game.canUserSendToday(message.author.id, message.guild.id)) {
                game.recordGlobalSend(message.guild.id, message.author.id);
            } else {
                const remaining = game.getMsUntilReset(message.guild.id);
                const embed = new EmbedBuilder()
                    .setTitle(await locale('shrimp.title'))
                    .setDescription(await locale('shrimp.alreadyPassed'))
                    .setFooter({ text: await locale('shrimp.cooldown') + ` ${timestamp(Math.floor(remaining / 1000))}` })
                    .setColor(color.RED);
                await message
                    .reply({ embeds: [embed] })
                    .then((message) => setTimeout(() => message.delete().catch(() => {}), 5000))
                    .catch(() => {});
                await message.delete().catch(() => {});
            }
        } else {
            const embed = new EmbedBuilder()
                .setTitle(await locale('shrimp.title'))
                .setDescription(await locale ('shrimp.unallowed'))
                .setImage(shrimp.gifUrl)
                .setColor(color.RED);
            await message
                .reply({ embeds: [embed] })
                .then((message) => setTimeout(() => message.delete().catch(() => {}), 5000))
                .catch(() => {});
            await message.delete().catch(() => {});
        }
    } catch (err) {
        handleError(err, 'Processing message for shrimp game', message);
    }
};
