const logger = require('../logger');
const { handleError } = require('../errorHandler');

const { trackJoin, trackLeave } = require('../../app/statistics');

module.exports = async (oldState, newState) => {
    try {
        if (!oldState.channelId && newState.channelId && newState.member && !newState.member.user.bot) {
            await trackJoin(newState.guild.id, newState.member.user.id);
            logger.debug(`(Guild ${newState.guild.id}) Member ${newState.member.user.id} joined voice channel ${newState.channelId}`);
        }

        if (oldState.channelId && !newState.channelId && oldState.member && !oldState.member.user.bot) {
            await trackLeave(oldState.guild.id, oldState.member.user.id);
            logger.debug(`(Guild ${oldState.guild.id}) Member ${oldState.member.user.id} left voice channel ${oldState.channelId}`);
        }
    } catch (err) {
        handleError(err, 'Voice state update error', null);
    }
};
