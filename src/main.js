const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const { addMessage, trackJoin, trackLeave } = require('./utils/statistics');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const commands = [];
const commandModules = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  if (command.data && command.execute) {
    commands.push(command.data);
    commandModules.push(command);
  }
}

client.on(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: '@rezelxn', type: 3 }],
    status: 'online'
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

  for (const mod of commandModules) {
    if (typeof mod.init === 'function') mod.init(client);
  }
});

client.on(Events.MessageCreate, message => {
  if (message.author.bot || !message.guild) return;
  addMessage(message.guild.id, message.author.id);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const guildId = (newState.guild ?? oldState.guild).id;
  const joined = !oldState.channelId && newState.channelId;
  const left = oldState.channelId && !newState.channelId;

  if (joined) trackJoin(guildId, userId);
  else if (left) trackLeave(guildId, userId);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = require(path.join(__dirname, 'commands', `${interaction.commandName}.js`));

    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}: ${error.message}`);
      await interaction.reply({ content: 'An error occurred while executing the command.', flags: 64 });
    }
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('stats_period')) {
    try {
      await require('./commands/stats').handleSelect(interaction);
    } catch (error) {
      logger.error('Error handling stats select: ' + error.message);
      await interaction.reply({ content: 'An error occurred while handling the stats select.', flags: 64 });
    }
  }
});

client.on(Events.ClientError, (error) => {
  logger.error('Client error: ' + error.message);
});

require('./dashboard/server').start(client);

client.login(process.env.TOKEN).catch(error => {
  logger.error('Failed to log in: ' + error.message);
});
