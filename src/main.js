const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    EmbedBuilder,
} = require("discord.js");
const {
    addMessage,
    trackJoin,
    trackLeave
} = require("./app/statistics");
const fs = require("fs");
const path = require("path");
const color = require("./utils/style");
const logger = require("./utils/logger");
const shrimpGame = require("./app/games/shrimp");

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

const commands = [];
const commandModules = [];
const commandFiles = fs
    .readdirSync(path.join(__dirname, "commands"))
    .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
    const command = require(path.join(__dirname, "commands", file));
    if (command.data && command.execute) {
        commands.push(command.data);
        commandModules.push(command);
    }
}

client.on(Events.ClientReady, async (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);

    readyClient.user.setPresence({
        activities: [{
            name: "@rezelxn",
            type: 3
        }],
        status: "online",
    });

    const rest = new REST({
        version: "10"
    }).setToken(process.env.TOKEN);
    const guildId = process.env.GUILD_ID;

    try {
        logger.info(
            `Registering ${commands.length} application command${commands.length !== 1 ? "s" : ""}...`,
        );

        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guildId), {
                body: commands,
            });
            logger.success(
                `Successfully registered ${commands.length} command${commands.length !== 1 ? "s" : ""}. (Guild: ${guildId})`,
            );
        } else {
            await rest.put(Routes.applicationCommands(readyClient.user.id), {
                body: commands,
            });
            logger.success(
                `Successfully registered ${commands.length} command${commands.length !== 1 ? "s" : ""}. (Global)`,
            );
        }
    } catch (error) {
        logger.error("Error registering commands: " + error.message);
    }

    for (const mod of commandModules) {
        if (typeof mod.init === "function") mod.init(readyClient);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    addMessage(message.guild.id, message.author.id);

    try {
        const cfg = shrimpGame.getConfig(message.guild.id);
        if (!cfg || !cfg.channelId) return;
        if (message.channel.id !== cfg.channelId) return;

        const hasGif = cfg.gifUrl && (
            message.content.includes(cfg.gifUrl) ||
            (message.attachments && Array.from(message.attachments.values()).some(a => a.url && a.url.includes('.gif')))
        );

        if (hasGif) {
            if (shrimpGame.canUserSendToday(message.author.id, message.guild.id)) {
                shrimpGame.recordGlobalSend(message.guild.id, message.author.id);
                logger.debug(`Authorized Pass The Shrimp message from ${message.author.id} in guild ${message.guild.id}.`);
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('🦐 PASS THE SHRIMP')
                    .setDescription('You are on cooldown for the shrimp game.')
                    .setColor(color.ESRANIKI);
                await message.reply({
                        embeds: [embed]
                    })
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
                    .catch(() => {});
                await message.delete().catch(() => {});
                logger.debug(`Unauthorized Pass The Shrimp message from ${message.author.id} in ${message.channel.id}, user on cooldown.`);
            }
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🦐 PASS THE SHRIMP')
                .setDescription('Only this GIF is allowed to be sent in this channel!')
                .setColor(color.ESRANIKI);
            await message.reply({
                    embeds: [embed]
                })
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
                .catch(() => {});
            await message.delete().catch(() => {});
            logger.debug(`Unauthorized Pass The Shrimp message from ${message.author.id} in ${message.channel.id}, wrong GIF or text.`);
        }
    } catch (err) {
        logger.error(`Pass The Shrimp game error: ${err.message}`);
    }
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

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = require(
            path.join(__dirname, "commands", `${interaction.commandName}.js`),
        );

        try {
            await command.execute(interaction, client);
        } catch (error) {
            logger.error(
                `Error executing ${interaction.commandName}: ${error.message}`,
            );
            await interaction
                .reply({
                    content: "An error occurred while executing the command.",
                    flags: 64,
                })
                .catch(() => {});
        }
    } else if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("stats_period")
    ) {
        try {
            await require("./commands/stats").handleSelect(interaction);
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
});

client.on(Events.Error, (error) => {
    logger.error("Client error: " + error.message);
});

require("./dashboard/server").start(client);

client.login(process.env.TOKEN).catch((error) => {
    logger.error("Failed to log in: " + error.message);
});
