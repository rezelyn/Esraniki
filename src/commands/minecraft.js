const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');
const emoji = require('../utils/style').emoji;
const color = require('../utils/style').color;
const logger = require('../utils/logger');
const { t, getLocalizations } = require('../utils/lang');

let activeEmbed = null;
let updateInterval = null;

const ms = 60000; // 60s

const file = path.join(__dirname, '../../data/minecraft.json');

function saveState() {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(activeEmbed));
  } catch (error) {
    logger.debug('Failed to save embed state: ' + error.message);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function startInterval(ip, client) {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(async () => {
    try {
      if (!activeEmbed) {
        logger.debug('No active embed, stopping updates');
        clearInterval(updateInterval);
        updateInterval = null;
        return;
      }
      logger.debug(`Updating server data for ${ip}`);
      const freshData = await fetchServerInfo(ip);

      const channel = await client.channels.fetch(activeEmbed.channelId);
      if (channel) {
        const message = await channel.messages.fetch(activeEmbed.messageId).catch(() => null);
        if (message) {
          await update(message, ip, activeEmbed.name, freshData);
          logger.debug(`Updated server data for ${ip}`);
        } else {
          logger.debug('No active embed, stopping updates');
          clearInterval(updateInterval);
          updateInterval = null;
          activeEmbed = null;
          saveState();
        }
      }
    } catch (error) {
      logger.debug('Update failed: ' + error.message);
    }
  }, ms);
}

async function init(client) {
  const entry = loadState();
  if (!entry) return;

  try {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (!message) {
      saveState();
      return;
    }

    activeEmbed = entry;
    logger.debug(`Resuming updates for ${entry.server} (${entry.name})`);
    startInterval(entry.server, client);
  } catch (error) {
    logger.debug('Failed to restore embed state: ' + error.message);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minecraft')
    .setDescription('Monitor a Minecraft server\'s status and player count in real-time.')
    .setDescriptionLocalizations(getLocalizations('commands.minecraft.description'))
    .addSubcommand(sub =>
      sub.setName('track')
        .setDescription('Start monitoring a Minecraft server')
        .setDescriptionLocalizations(getLocalizations('commands.minecraft.track.description'))
        .addStringOption(opt =>
          opt.setName('ip')
            .setDescription('IP address of the Minecraft server to monitor')
            .setDescriptionLocalizations(getLocalizations('commands.minecraft.track.ip'))
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Custom name displayed in the embed title')
            .setDescriptionLocalizations(getLocalizations('commands.minecraft.track.name'))
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('update')
        .setDescription('Force update the currently monitored Minecraft server data')
        .setDescriptionLocalizations(getLocalizations('commands.minecraft.update.description'))
    ),

  init,

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'track') {
      const ip = interaction.options.getString('ip');
      const name = interaction.options.getString('name') || ip;

      if (activeEmbed) {
        await interaction.deferReply({ flags: 64 });
        try {
          logger.info(`Re-tracking server ${ip}`);
          const server = await fetchServerInfo(ip);
          const channel = await client.channels.fetch(activeEmbed.channelId).catch(() => null);
          const message = channel ? await channel.messages.fetch(activeEmbed.messageId).catch(() => null) : null;

          if (message) {
            await update(message, ip, name, server);
            activeEmbed = { channelId: activeEmbed.channelId, messageId: activeEmbed.messageId, server: ip, name };
            saveState();
            startInterval(ip, client);
            await interaction.editReply({ content: t('minecraft.monitoringUpdated', { name }) });
          } else {
            activeEmbed = null;
            saveState();
            await interaction.editReply({ content: t('minecraft.embedNotFound') });
          }
        } catch (error) {
          logger.error('Error re-tracking server: ' + error.message);
          await interaction.editReply({ content: t('minecraft.unableToFetch') });
        }
        return;
      }

      await interaction.deferReply();
      try {
        logger.info(`Fetching server data for ${ip}`);
        const server = await fetchServerInfo(ip);
        logger.debug(`Server data fetched, online: ${server.online}`);

        await process(interaction, ip, name, server, client);
        startInterval(ip, client);
      } catch (error) {
        logger.error('Error fetching Minecraft server info: ' + error.message);
        const errorEmbed = new EmbedBuilder()
          .setColor(color.RED)
          .setTitle(t('minecraft.error.title'))
          .setDescription(t('minecraft.error.description'));
        await interaction.editReply({ embeds: [errorEmbed] });
      }
      return;
    }

    if (sub === 'update') {
      if (!activeEmbed) {
        await interaction.reply({ content: t('minecraft.noMonitoring'), flags: 64 });
        return;
      }

      await interaction.deferReply({ flags: 64 });
      try {
        logger.info(`Force updating server data for ${activeEmbed.server}`);
        const server = await fetchServerInfo(activeEmbed.server);
        const channel = await client.channels.fetch(activeEmbed.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(activeEmbed.messageId).catch(() => null) : null;

        if (!message) {
          activeEmbed = null;
          saveState();
          await interaction.editReply({ content: t('minecraft.embedNotFound') });
          return;
        }

        await update(message, activeEmbed.server, activeEmbed.name, server);
        await interaction.editReply({ content: t('minecraft.dataUpdated', { name: activeEmbed.name }) });
      } catch (error) {
        logger.error('Error force updating server: ' + error.message);
        await interaction.editReply({ content: t('minecraft.unableToFetch') });
      }
    }
  }
};

async function process(interaction, ip, name, server, client) {
  try {
    if (!server.online) {
      const errorEmbed = new EmbedBuilder()
        .setColor(color.GRAY)
        .setTitle(name)
        .setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`)
        .setDescription(t('minecraft.offline'))
        .addFields(
          { name: `${emoji.STATUS} ${t('minecraft.fields.status')}`, value: t('minecraft.statusOffline'), inline: true },
          { name: `${emoji.USER} ${t('minecraft.fields.players')}`, value: `${server.players.online}/${server.players.max}`, inline: true },
          { name: `${emoji.VERSION} ${t('minecraft.fields.version')}`, value: server.version || t('minecraft.versionUnknown'), inline: true }
        )
        .setFooter({ text: t('minecraft.lastUpdated') })
        .setTimestamp();

      const response = await interaction.editReply({ embeds: [errorEmbed] });
      activeEmbed = { channelId: interaction.channelId, messageId: response.id, server: ip, name };
      saveState();
      return;
    }

    const players = server.players.list || [];
    const displayed = players.slice(0, 10);
    const rest = players.length - displayed.length;
    let list = null;
    if (players.length > 0) {
      list = displayed.map(p => `- \`${p.name}\``).join('\n');
      if (rest > 0) list += `\n- ${t('minecraft.othersMore', { count: rest })}`;
    } else if (server.players.online > 0) {
      list = t('minecraft.playersUnavailable');
    }

    const embed = create(ip, name, server, list);
    const response = await interaction.editReply({ embeds: [embed] });

    activeEmbed = {
      channelId: interaction.channelId,
      messageId: response.id,
      server: ip,
      name
    };
    saveState();
  } catch (error) {
    logger.error(`Error fetching Minecraft server info: ${error.message}`);
    logger.debug(`Full error: ${JSON.stringify(error, null, 2)}`);
    throw error;
  }
}

async function update(message, ip, name, server) {
  if (!server.online) {
    const errorEmbed = new EmbedBuilder()
      .setColor(color.GRAY)
      .setTitle(name)
      .setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`)
      .setDescription(t('minecraft.offline'))
      .addFields(
        { name: `${emoji.STATUS} ${t('minecraft.fields.status')}`, value: t('minecraft.statusOffline'), inline: true },
        { name: `${emoji.USER} ${t('minecraft.fields.players')}`, value: `${server.players.online}/${server.players.max}`, inline: true },
        { name: `${emoji.VERSION} ${t('minecraft.fields.version')}`, value: server.version || t('minecraft.versionUnknown'), inline: true }
      )
      .setFooter({ text: t('minecraft.lastUpdated') })
      .setTimestamp();

    await message.edit({ embeds: [errorEmbed] });
    return;
  }

  const players = server.players.list || [];
  const displayed = players.slice(0, 10);
  const rest = players.length - displayed.length;
  let list = null;
  if (players.length > 0) {
    list = displayed.map(p => `- \`${p.name}\``).join('\n');
    if (rest > 0) list += `\n- ${t('minecraft.othersMore', { count: rest })}`;
  } else if (server.players.online > 0) {
    list = t('minecraft.playersUnavailable');
  }

  const embed = create(ip, name, server, list);
  await message.edit({ embeds: [embed] });
}

function create(ip, name, server, list) {
  const embed = new EmbedBuilder()
    .setColor(color.GREEN)
    .setTitle(name)
    .setDescription(server.motd)
    .setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`)
    .addFields(
      { name: `${emoji.STATUS} ${t('minecraft.fields.status')}`, value: t('minecraft.statusOnline'), inline: true },
      { name: `${emoji.USER} ${t('minecraft.fields.players')}`, value: `${server.players.online}/${server.players.max}`, inline: true },
      { name: `${emoji.VERSION} ${t('minecraft.fields.version')}`, value: (server.version || t('minecraft.versionUnknown')).substring(0, 1024), inline: true }
    )
    .setFooter({ text: t('minecraft.lastUpdated') })
    .setTimestamp();

  if (list) embed.addFields({ name: `${emoji.LIST} ${t('minecraft.connected')}`, value: list.length <= 1024 ? list : list.substring(0, 1021) + '...', inline: false });
  return embed;
}

async function fetchServerInfo(ip) {
  return new Promise((resolve, reject) => {
    const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Esraniki'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {        
        if (!data.startsWith('{')) {
          reject(new Error(`API returned invalid data:\n${data.substring(0, 100)}`));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.error) {
            reject(new Error(`API error:\n${parsed.error}`));
            return;
          }
          
          const isOnline = parsed.online === true || (!parsed.debug?.error);
          
          resolve({
            online: isOnline,
            motd: parsed.motd?.clean?.join('\n') || 'A Minecraft server',
            players: {
              online: parsed.players?.online || 0,
              max: parsed.players?.max || 0,
              list: parsed.players?.list || []
            },
            version: parsed.version || 'Unknown',
          });
        } catch (error) {
          reject(new Error('Failed to parse API response: ' + error.message));
        }
      });
    }).on('error', error => {
      reject(new Error('Network error: ' + error.message));
    });
  });
}
