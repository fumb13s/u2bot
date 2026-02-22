const { MessageFlags, SlashCommandBuilder, ChannelType } = require('discord.js');
const { addWatcher, removeWatcher, getWatcher, getAllWatchers, getWatcherState, initWatcherState } = require('./watcherStore');
const config = require('./config');

const WATCH_COMMAND = new SlashCommandBuilder()
  .setName('watch')
  .setDescription('Add a YouTube channel watcher')
  .addStringOption((opt) =>
    opt.setName('channel_id').setDescription('YouTube channel ID (starts with UC)').setRequired(true),
  )
  .addChannelOption((opt) =>
    opt.setName('discord_channel').setDescription('Discord channel for notifications').setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((opt) =>
    opt.setName('label').setDescription('Human-readable label for this watcher').setRequired(false),
  );

const UNWATCH_COMMAND = new SlashCommandBuilder()
  .setName('unwatch')
  .setDescription('Remove a YouTube channel watcher')
  .addStringOption((opt) =>
    opt.setName('channel_id').setDescription('YouTube channel ID to remove').setRequired(true),
  );

const WATCHERS_COMMAND = new SlashCommandBuilder()
  .setName('watchers')
  .setDescription('List all YouTube channel watchers');

const WATCHER_COMMAND = new SlashCommandBuilder()
  .setName('watcher')
  .setDescription('Show detailed status for a watcher')
  .addStringOption((opt) =>
    opt.setName('channel_id').setDescription('YouTube channel ID').setRequired(true),
  );

function isPollerHealthy(lastPollAt, intervalMinutes) {
  if (!lastPollAt) return false;
  const maxAge = intervalMinutes * 2 * 60 * 1000;
  return Date.now() - lastPollAt.getTime() < maxAge;
}

function formatTimestamp(date) {
  if (!date) return 'never';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

async function handleWatcherInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'watch':
      return handleWatch(interaction);
    case 'unwatch':
      return handleUnwatch(interaction);
    case 'watchers':
      return handleWatchers(interaction);
    case 'watcher':
      return handleWatcher(interaction);
    default:
      return;
  }
}

async function handleWatch(interaction) {
  const channelId = interaction.options.getString('channel_id');
  const discordChannel = interaction.options.getChannel('discord_channel');
  const label = interaction.options.getString('label') || '';

  if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
    await interaction.reply({
      content: 'Invalid YouTube channel ID. It should start with "UC" and be 24 characters long.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (getWatcher(channelId)) {
    await interaction.reply({
      content: `A watcher for \`${channelId}\` already exists.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify bot can post to the channel
  const botMember = interaction.guild.members.me;
  const permissions = discordChannel.permissionsFor(botMember);
  if (!permissions || !permissions.has('SendMessages')) {
    await interaction.reply({
      content: `I don't have permission to send messages in <#${discordChannel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const watcher = addWatcher(channelId, discordChannel.id, label);
  await interaction.reply({
    content: `Watcher added: \`${channelId}\`${label ? ` (${label})` : ''} → <#${discordChannel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUnwatch(interaction) {
  const channelId = interaction.options.getString('channel_id');

  if (!removeWatcher(channelId)) {
    await interaction.reply({
      content: `No watcher found for \`${channelId}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `Watcher removed: \`${channelId}\``,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleWatchers(interaction) {
  const watchers = getAllWatchers();

  if (watchers.length === 0) {
    await interaction.reply({
      content: 'No watchers configured. Use `/watch` to add one.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = watchers.map((w) => {
    const state = getWatcherState(w.id);
    const name = state?.channelName || w.label || w.id;
    const rssOk = state ? isPollerHealthy(state.lastRssPollAt, config.polling.rssFeedIntervalMinutes) : false;
    const health = rssOk ? 'Healthy' : 'Unhealthy';
    return `**${name}** (\`${w.id}\`) → <#${w.discordChannelId}> — ${health}`;
  });

  const embed = {
    title: 'YouTube Watchers',
    description: lines.join('\n'),
    color: 0x0099ff,
  };

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleWatcher(interaction) {
  const channelId = interaction.options.getString('channel_id');
  const watcher = getWatcher(channelId);

  if (!watcher) {
    await interaction.reply({
      content: `No watcher found for \`${channelId}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const state = getWatcherState(channelId);
  const name = state?.channelName || watcher.label || watcher.id;
  const rssOk = state ? isPollerHealthy(state.lastRssPollAt, config.polling.rssFeedIntervalMinutes) : false;

  const rssStatus = state?.lastRssPollAt
    ? `${state.lastRssPollOk ? 'OK' : 'Error'} — ${formatTimestamp(state.lastRssPollAt)}`
    : 'Not yet polled';

  const embed = {
    title: `Watcher: ${name}`,
    color: rssOk ? 0x00cc00 : 0xcc0000,
    fields: [
      { name: 'YouTube Channel ID', value: `\`${watcher.id}\``, inline: true },
      { name: 'Discord Channel', value: `<#${watcher.discordChannelId}>`, inline: true },
      { name: 'RSS Poller', value: rssStatus, inline: false },
      { name: 'Tracked Videos', value: String(state?.seenVideoCount ?? 0), inline: true },
      { name: 'Added', value: formatTimestamp(new Date(watcher.addedAt)), inline: true },
    ],
  };

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

const watcherCommandBuilders = [WATCH_COMMAND, UNWATCH_COMMAND, WATCHERS_COMMAND, WATCHER_COMMAND];

module.exports = { handleWatcherInteraction, watcherCommandBuilders };
