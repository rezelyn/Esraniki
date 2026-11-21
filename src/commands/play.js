const {
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');
const { guildLocale, getLocalizations } = require('../utils/lang');
const engine = require('../app/player/engine');
const { parseQuery } = require('../app/player/provider');
const { describeError } = require('../app/player/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play audio from YouTube or SoundCloud in a voice channel')
        .setDescriptionLocalizations(
            getLocalizations('commands.play.description'),
        )
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
            option
                .setName('query')
                .setRequired(true)
                .setDescription('A track link, playlist link, or search terms')
                .setDescriptionLocalizations(
                    getLocalizations('commands.play.query'),
                )
                .setMaxLength(500),
        )
        .addStringOption((option) =>
            option
                .setName('source')
                .setDescription('Where to search for tracks')
                .setDescriptionLocalizations(getLocalizations('commands.play.source'))
                .addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'SoundCloud', value: 'soundcloud' }),
        ),

    async execute(interaction) {
        const t = guildLocale(interaction.guildId);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.inCachedGuild()) {
            return interaction.editReply(await t('player.guild'));
        }
        let content;
        try {
            const query = interaction.options.getString('query', true);
            let source = interaction.options.getString('source');
            let member = interaction.member;
            if (parseQuery(query, source ?? 'youtube').kind === 'search' && !source) {
                engine.authorize({ guild: interaction.guild, member });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('play-source:youtube').setLabel('YouTube').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('play-source:soundcloud').setLabel('SoundCloud').setStyle(ButtonStyle.Secondary),
                );
                const prompt = await interaction.editReply({ content: await t('player.chooseSource'), components: [row] });
                let choice;
                try {
                    choice = await prompt.awaitMessageComponent({
                        componentType: ComponentType.Button,
                        filter: click => click.user.id === interaction.user.id && ['play-source:youtube', 'play-source:soundcloud'].includes(click.customId),
                        time: 60000,
                    });
                } catch (error) {
                    if (error.code !== 'InteractionCollectorError') throw error;
                    return interaction.editReply({ content: await t('player.sourceExpired'), components: [] });
                }
                source = choice.customId.split(':')[1];
                member = choice.member;
                await choice.update({ content: await t('player.searching'), components: [] });
            }
            const result = await engine.enqueue({
                guild: interaction.guild,
                member,
                query,
                source: source ?? 'youtube',
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
            components: [],
            allowedMentions: { parse: [] },
        });
    },
};
