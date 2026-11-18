const logger = require('./logger');

async function handleError(error, context, interaction) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${context ? `${context}: ` : ''}${error instanceof Error ? error.stack || errorMessage : errorMessage}`);

    if (!interaction) return;

    try {
        const { locale } = require('./lang');
        const errorLabel = await locale('generic.errCommand', {}, interaction.guildId);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: errorLabel,
                flags: 64
            });
        } else {
            await interaction.reply({
                content: errorLabel,
                flags: 64
            });
        }
    } catch (_) {}
}

module.exports = { handleError };
