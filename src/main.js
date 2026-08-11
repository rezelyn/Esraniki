const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    EmbedBuilder,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { handleError } = require('./utils/errorHandler');

const isDev = process.argv.includes('--dev');
const envFile = isDev ? '.env.dev' : '.env';
const envPath = path.resolve(process.cwd(), envFile);

const dotenvResult = require('dotenv').config({ path: envPath, quiet: true });
if (dotenvResult.error) {
    logger.error(`Could not load '${envFile}': ${dotenvResult.error.message}`);
} else {
    logger.debug(`Loaded ${Object.keys(dotenvResult.parsed).length} variable(s) from '${envFile}'`);
}

if (isDev) {
    logger.debug(`GUILD_ID: ${process.env.GUILD_ID || 'NOT SET'}`);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Map();
client.once('clientReady', () => {
    logger.success(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: 'Made with <3 by',
            state: '@rezelxn',
            type: 4,
        }],
        status: 'online',
    });

    require('./dashboard/server').start(client);
});

const messageCreateHandler = require('./utils/client/messageCreate');
const voiceStateUpdateHandler = require('./utils/client/voiceStateUpdate');
const interactionCreateHandler = require('./utils/client/interactionCreate');

client.on(Events.MessageCreate, messageCreateHandler);
client.on(Events.VoiceStateUpdate, voiceStateUpdateHandler);
client.on(Events.InteractionCreate, interactionCreateHandler);

const commands = [];
const commandFiles = fs.readdirSync('./src/commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
    client.commands.set(command.data.name, command);
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function clearCommands(clientId, excludeGuildId = null) {
    const guilds = await rest.get(Routes.userGuilds());
    const targets = excludeGuildId ? guilds.filter(guild => guild.id !== excludeGuildId) : guilds;
    logger.debug(`Clearing application commands in ${targets.length} Guild${targets.length !== 1 ? 's' : ''}`);

    for (const guild of targets) {
        try {
            await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: [] });
        } catch (err) {
            handleError(err, `Clearing commands for Guild ${guild.id}`);
        }
    }

    logger.debug(`Cleared application commands in ${targets.length} Guild${targets.length !== 1 ? 's' : ''}`);
}

async function getGlobalCommands(clientId) {
    try {
        return await rest.get(Routes.applicationCommands(clientId));
    } catch (err) {
        handleError(err, 'Fetching existing global application commands');
        return [];
    }
}

function withEntryPoint(commands, existing) {
    const entryPoint = existing.find((command) => command.type === 4);
    return entryPoint ? [...commands, entryPoint] : commands;
}

async function registerCommands() {
    const { CLIENT_ID, GUILD_ID } = process.env;

    try {
        const existingGlobal = await getGlobalCommands(CLIENT_ID);

        if (isDev && GUILD_ID) {
            logger.info(`Registering ${commands.length} application command${commands.length !== 1 ? 's' : ''}`);

            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: withEntryPoint([], existingGlobal) });
            await clearCommands(CLIENT_ID, GUILD_ID);
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

            logger.success(`Registered ${commands.length} application command${commands.length !== 1 ? 's' : ''}`);
        } else {
            if (GUILD_ID && !isDev) {
                logger.warn(`Production mode detected, ignoring GUILD_ID. Use 'npm run dev' to use developement environement.`);
            }

            logger.info(`Registering ${commands.length} application command${commands.length !== 1 ? 's' : ''}`);

            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: withEntryPoint(commands, existingGlobal) });

            if (isDev) {
                await clearCommands(CLIENT_ID);
            }

            logger.success(`Registered ${commands.length} application command${commands.length !== 1 ? 's' : ''}`);
        }
    } catch (error) {
        handleError(error, 'Registering application commands');
    }
}

registerCommands();

client.login(process.env.TOKEN);
