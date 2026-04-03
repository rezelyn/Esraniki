const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  if (command.data && command.execute) {
    commands.push(command.data);
  }
}

client.on(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: '@rezelxn', type: 3 }],
    status: 'invisible'
  });

  const rest = new REST({ version: 10 }).setToken(process.env.TOKEN);
  const guildId = process.env.GUILD_ID;

  try {
    logger.info(`Registering ${commands.length} application command${commands.length !== 1 ? 's' : ''}...`);
    
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      logger.success(`Successfully registered ${commands.length} command${commands.length !== 1 ? 's' : ''}. (Guild: ${guildId})`);
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      logger.success(`Successfully registered ${commands.length} command${commands.length !== 1 ? 's' : ''}. (Global)`);
    }
  } catch (error) {
    logger.error('Error registering commands: ' + error.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = require(path.join(__dirname, 'commands', `${interaction.commandName}.js`));
  
  try {
    await command.execute(interaction, client);
  } catch (error) {
    logger.error(`Error executing ${interaction.commandName}: ${error.message}`);
    await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de la commande.', flags: 64 });
  }
});

client.on(Events.ClientError, (error) => {
  logger.error('Client error: ' + error.message);
});

client.login(process.env.TOKEN);
