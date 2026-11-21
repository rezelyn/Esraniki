const { handleError } = require('../errorHandler');

module.exports = async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, interaction.client);
        } catch (err) {
            handleError(err, `Error executing command ${interaction.commandName}`, interaction);
        }
    } else if (interaction.isButton() && interaction.customId.startsWith('player:')) {
        try {
            await require('../../app/player/discord').handleButton(interaction);
        } catch (err) {
            handleError(err, 'Handling player control', interaction);
        }
    } else if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith('stats_period')
    ) {
        try { 
            await require('../../commands/stats').handleSelect(interaction);
        } catch (err) { 
            handleError(err, 'Error handling stats select', interaction);
        }
    }
};
