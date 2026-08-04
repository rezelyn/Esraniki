const logger = require('../logger');
const { handleError } = require('../errorHandler');

const { trackJoin, trackLeave } = require('../../app/statistics');

module.exports = async (oldState, newState) => {
    try {
        if (!oldState.channelId && newState.channelId && newState.member && !newState.member.user.bot) {
            await trackJoin(newState.guild.id, newState.member.user.id);
            logger.debug(`Member ${newState.member.user.id} joined voice channel ${newState.channelId} in guild ${newState.guild.id}`);
        }

        if (oldState.channelId && !newState.channelId && oldState.member && !oldState.member.user.bot) {
            await trackLeave(oldState.guild.id, oldState.member.user.id);
            logger.debug(`Member ${oldState.member.user.id} left voice channel ${oldState.channelId} in guild ${oldState.guild.id}`);
        }
    } catch (err) {
        handleError(err, 'Voice state update error', null);
    }
};
