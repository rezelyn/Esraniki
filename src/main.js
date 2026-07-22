const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    EmbedBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const logger = require("./utils/logger");
const { handleError } = require("./utils/errorHandler");

require("dotenv").config();

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
client.once("clientReady", () => {
    logger.success(`Logged in as ${client.user.tag}`);
    require("./dashboard/server").start(client);
});

const messageCreateHandler = require("./utils/events/messageCreate");
const voiceStateUpdateHandler = require("./utils/events/voiceStateUpdate");
const interactionCreateHandler = require("./utils/events/interactionCreate");

client.on(Events.MessageCreate, messageCreateHandler);
client.on(Events.VoiceStateUpdate, voiceStateUpdateHandler);
client.on(Events.InteractionCreate, interactionCreateHandler);

const commands = [];
const commandFiles = fs.readdirSync("./src/commands").filter(file => file.endsWith(".js"));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
    client.commands.set(command.data.name, command);
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
    try {
        logger.info(`Registering ${commands.length} application (/) command${commands.length !== 1 ? "s" : ""}`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        logger.success(`Successfully registered ${commands.length} application (/) command${commands.length !== 1 ? "s" : ""}`);
    } catch (error) {
        handleError(error, "Registering application commands");
    }
})();

client.login(process.env.TOKEN);
