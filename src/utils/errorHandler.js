const logger = require('./logger');

function handleError(error, context, interaction) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(error.stack);

  if (interaction) {
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({
        content: `There was an error while executing this command!`,
        flags: 64
      }).catch(() => {});
    } else {
      interaction.reply({
        content: `There was an error while executing this command!`,
        flags: 64
      }).catch(() => {});
    }
  }
}

module.exports = { handleError };
