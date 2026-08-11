const logger = require('./logger');

function handleError(error, context, interaction) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(error.stack);

    const errorLabel = locale('generic.errCommand')

    if (interaction) {
        if (interaction.replied || interaction.deferred) {
            interaction
                .followUp({
                    content: `${errorLabel}`,
                    flags: 64
                })
                .catch(() => {});
        } else {
            interaction
                .reply({
                    content: `${errorLabel}`,
                    flags: 64
                })
                .catch(() => {});
        }
    }
}

module.exports = { handleError };
