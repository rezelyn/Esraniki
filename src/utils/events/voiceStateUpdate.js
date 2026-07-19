const { trackJoin, trackLeave } = require('../../app/statistics');
const { logger } = require('../../utils/logger');

module.exports = async (oldState, newState) => {
  try {
    if (!oldState.channelId && newState.channelId && newState.member && !newState.member.user.bot) {
      trackJoin(newState.guild.id, newState.member.user.id);
      logger.debug(`Member ${newState.member.user.id} joined voice channel ${newState.channelId} in guild ${newState.guild.id}`);
    }

    if (oldState.channelId && !newState.channelId && oldState.member && !oldState.member.user.bot) {
      trackLeave(oldState.guild.id, oldState.member.user.id);
      logger.debug(`Member ${oldState.member.user.id} left voice channel ${oldState.channelId} in guild ${oldState.guild.id}`);
    }
  } catch (err) {
    logger.error(`Voice state update error: ${err.message}`);
  }
};
