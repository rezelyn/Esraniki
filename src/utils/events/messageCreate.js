const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { handleError } = require('../../utils/errorHandler');
const color = require('../../utils/style');

const { addMessage } = require('../../app/statistics');
const game = require('../../app/games/shrimp');

module.exports = async (message) => {
  if (message.author.bot || !message.guild) return;
  await addMessage(message.guild.id, message.author.id);

  try {
    const shrimp = game.getConfig(message.guild.id);
    if (!shrimp || !shrimp.channelId) return;
    if (message.channel.id !== shrimp.channelId) return;

    const hasGif = shrimp.gifUrl && (
      message.content.includes(shrimp.gifUrl) ||
      (message.attachments && Array.from(message.attachments.values()).some(a => a.url && a.url.includes('.gif')))
    );

    if (hasGif) {
      if (game.canUserSendToday(message.author.id, message.guild.id)) {
        game.recordGlobalSend(message.guild.id, message.author.id);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('🦐 PASS THE SHRIMP')
          .setDescription(`You are on cooldown!`)
          .setColor(color.ACCENT)
        await message.reply({
                embeds: [embed]
              })
              .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
              .catch(() => {});
        await message.delete().catch(() => {});
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🦐 PASS THE SHRIMP')
        .setDescription('Only this GIF is allowed to be sent in this channel!')
      await message.reply({
              embeds: [embed]
            })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
        await message.delete().catch(() => {});
      }
  } catch (err) {
    handleError(err, 'Processing message for shrimp game', message);
  }
};
