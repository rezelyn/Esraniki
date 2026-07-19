const { EmbedBuilder } = require('discord.js');
const { addMessage } = require('../../app/statistics');
const { shrimpGame, getUserCooldownRemaining } = require('../../app/games/shrimp');
const { logger } = require('../../utils/logger');
const { color } = require('../../utils/style');

module.exports = async (message) => {
  if (message.author.bot || !message.guild) return;
  addMessage(message.guild.id, message.author.id);

  try {
    const cfg = shrimpGame.getConfig(message.guild.id);
    if (!cfg || !cfg.channelId) return;
    if (message.channel.id !== cfg.channelId) return;

    const hasGif = cfg.gifUrl && (
      message.content.includes(cfg.gifUrl) ||
      (message.attachments && Array.from(message.attachments.values()).some(a => a.url && a.url.includes('.gif')))
    );

    if (hasGif) {
      if (shrimpGame.canUserSendToday(message.author.id, message.guild.id)) {
        shrimpGame.recordGlobalSend(message.guild.id, message.author.id);
        logger.debug(`Allowed message from ${message.author.id}, authorized GIF match.`);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('🦐 PASS THE SHRIMP')
          .setDescription(`You are on cooldown! You will be able to send another GIF in: ${getUserCooldownRemaining}`)
          .setColor(color.ESRANIKI);
        await message.reply({
              embeds: [embed]
            })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
        await message.delete().catch(() => {});
        logger.debug(`Denied message from ${message.author.id}, user is on cooldown.`);
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🦐 PASS THE SHRIMP')
        .setDescription('Only this GIF is allowed to be sent in this channel!')
        .setImage(`${cfg.gifUrl}`)
        .setColor(color.ESRANIKI);
      await message.reply({
              embeds: [embed]
            })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
      await message.delete().catch(() => {});
      logger.debug(`Denied message from ${message.author.id}, authorized GIF mismatched or sent text.`);
    }
  } catch (err) {
    logger.error(`Pass The Shrimp game error: ${err.message}`);
  }
};
