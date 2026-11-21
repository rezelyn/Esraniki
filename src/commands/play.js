const {
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags,
} = require('discord.js');
const { guildLocale, getLocalizations } = require('../utils/lang');
const engine = require('../app/player/engine');
const { describeError } = require('../app/player/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play audio from YouTube in a voice channel')
        .setDescriptionLocalizations(
            getLocalizations('commands.play.description'),
        )
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
            option
                .setName('query')
                .setRequired(true)
                .setDescription('A video link or search terms')
                .setDescriptionLocalizations(
                    getLocalizations('commands.play.query'),
                )
                .setMaxLength(500),
        )
        .addBooleanOption((option) =>
            option
                .setName('playlist')
                .setDescription(
                    'Import a YouTube playlist from the supplied link',
                )
                .setDescriptionLocalizations(
                    getLocalizations('commands.play.playlist'),
                ),
        ),

    async execute(interaction) {
        const t = guildLocale(interaction.guildId);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.inCachedGuild()) {
            return interaction.editReply(await t('player.guild'));
        }
        let content;
        try {
            const result = await engine.enqueue({
                guild: interaction.guild,
                member: interaction.member,
                query: interaction.options.getString('query', true),
                playlist: interaction.options.getBoolean('playlist') ?? false,
            });
            const lines = [await t('player.added', { added: result.added })];
            if (result.unavailable)
                lines.push(
                    await t('player.unavailable', {
                        count: result.unavailable,
                    }),
                );
            if (result.omitted === null)
                lines.push(await t('player.moreOmitted'));
            else if (result.omitted)
                lines.push(
                    await t('player.omitted', { count: result.omitted }),
                );
            content = lines.join(' ');
        } catch (err) {
            content = await describeError(err, t);
        }
        return interaction.editReply({
            content,
            allowedMentions: { parse: [] },
        });
    },
};
