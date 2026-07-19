const { logger } = require('../../utils/logger');

module.exports = async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      logger.debug(`Executing command ${interaction.commandName} (Requested by ${interaction.user.id})`);
      await command.execute(interaction, interaction.client);
    } catch (err) {
      logger.error(`Error executing command ${interaction.commandName}: ${err.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `There was an error while executing this command!`,
          flag: 64
        });
      } else { 
        await interaction.reply({
          content: `There was an error while executing this command!`,
          flag: 64
        });
      }
    }
  } else if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("stats_period")
  ) {
    try {
      await require("../../commands/stats").handleSelect(interaction);
    } catch (error) {
      logger.error("Error handling stats select: " + error.message);
      await interaction
        .reply({
          content: "An error occurred while handling the stats select.",
          flags: 64,
        })
        .catch(() => {});
    }
  }
};