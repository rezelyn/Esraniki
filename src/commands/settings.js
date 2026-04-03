const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t, setLanguage, getLocalizations, supported } = require('../utils/lang');
const appSettings = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure various bot settings')
    .setDescriptionLocalizations(getLocalizations('commands.settings.description'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('debug')
      .setDescription('Enable or disable debug logging')
      .setDescriptionLocalizations(getLocalizations('commands.settings.debug.description'))
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Whether debug logging should be enabled')
        .setDescriptionLocalizations(getLocalizations('commands.settings.debug.enabled'))
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('language')
      .setDescription('Set the bot display language')
      .setDescriptionLocalizations(getLocalizations('commands.settings.language.description'))
      .addStringOption(opt => opt
        .setName('locale')
        .setDescription('Language to use')
        .setDescriptionLocalizations(getLocalizations('commands.settings.language.locale'))
        .setRequired(true)
        .addChoices(
          { name: 'English', value: 'en_us' },
          { name: 'Français', value: 'fr_fr' }
        )
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'debug') {
      const enabled = interaction.options.getBoolean('enabled');
      appSettings.set('debug', enabled);

      await interaction.reply({
        content: t(`settings.debug.${enabled ? 'enabled' : 'disabled'}`),

        flags: 64
      });
    }

    if (sub === 'language') {
      const locale = interaction.options.getString('locale');
      setLanguage(locale);

      await interaction.reply({
        content: (locale === 'en_us' ? '🇺🇸 ' : '🇫🇷 ') + t('settings.language.set', { locale }),
        flags: 64
      });
    }
  }
};
