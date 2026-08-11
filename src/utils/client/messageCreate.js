const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../errorHandler');
const { color, timestamp } = require('../style');

const { trackMessage } = require('../../app/statistics');
const game = require('../../app/games/shrimp');

module.exports = async (message) => {
    if (message.author.bot || !message.guild) return;
    await trackMessage(message.guild.id, message.author.id);

    try {
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
                    .setTitle('🦐 PASS THE SHRIMP')
                    .setDescription(`You've already passed the shrimp today!`)
                    .setFooter({ text: `Cooldown resets in: ${timestamp(Math.floor(remaining / 1000))}` })
                    .setColor(color.RED);
                await message
                    .reply({ embeds: [embed] })
                    .then((message) => setTimeout(() => message.delete().catch(() => {}), 5000))
                    .catch(() => {});
                await message.delete().catch(() => {});
            }
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🦐 PASS THE SHRIMP')
                .setDescription('Only this GIF is allowed to be sent in this channel!')
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
