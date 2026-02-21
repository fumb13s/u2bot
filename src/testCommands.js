const { MessageFlags } = require('discord.js');
const { fetchLatestVideo } = require('./rssPoller');
const { fetchLiveStatus } = require('./liveChecker');
const { sendVideoNotification, sendLiveNotification } = require('./discordNotifier');
const { getAllWatchers, getWatcher, getWatcherState } = require('./watcherStore');
const config = require('./config');

function resolveWatcher(interaction) {
  const channelId = interaction.options.getString('channel_id');
  const watchers = getAllWatchers();

  if (channelId) {
    const watcher = getWatcher(channelId);
    if (!watcher) return { error: `No watcher found for \`${channelId}\`.` };
    return { watcher };
  }

  if (watchers.length === 0) {
    return { error: 'No watchers configured. Use `/watch` to add one.' };
  }

  if (watchers.length === 1) {
    return { watcher: watchers[0] };
  }

  const ids = watchers.map((w) => `\`${w.id}\``).join(', ');
  return { error: `Multiple watchers exist. Please specify a \`channel_id\`: ${ids}` };
}

async function handleTestInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'test_video') {
    await handleTestVideo(interaction);
  } else if (interaction.commandName === 'test_live') {
    await handleTestLive(interaction);
  }
}

async function handleTestVideo(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { watcher, error } = resolveWatcher(interaction);
  if (error) {
    await interaction.editReply(error);
    return;
  }

  try {
    const videoData = await fetchLatestVideo(watcher.id);
    if (!videoData) {
      await interaction.editReply('Could not fetch the latest video from the RSS feed.');
      return;
    }

    const channel = await interaction.client.channels.fetch(watcher.discordChannelId);
    if (!channel) {
      await interaction.editReply(`Could not fetch Discord channel: ${watcher.discordChannelId}`);
      return;
    }

    await sendVideoNotification(channel, videoData, config);
    await interaction.editReply(`Test video notification sent to <#${watcher.discordChannelId}> for: **${videoData.title}**`);
  } catch (err) {
    console.error('test_video error:', err.message);
    await interaction.editReply(`Error: ${err.message}`);
  }
}

async function handleTestLive(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { watcher, error } = resolveWatcher(interaction);
  if (error) {
    await interaction.editReply(error);
    return;
  }

  const watcherState = getWatcherState(watcher.id);

  try {
    const result = await fetchLiveStatus(watcher.id, watcherState?.channelName || '');
    if (result === null || result.videoId === 'unknown') {
      await interaction.editReply('Could not fetch live stream info from YouTube.');
      return;
    }

    const channel = await interaction.client.channels.fetch(watcher.discordChannelId);
    if (!channel) {
      await interaction.editReply(`Could not fetch Discord channel: ${watcher.discordChannelId}`);
      return;
    }

    await sendLiveNotification(channel, result, config);
    const liveNote = result.isLive ? ' (currently live)' : ' (not currently live)';
    await interaction.editReply(`Test live notification sent to <#${watcher.discordChannelId}> for: **${result.title}**${liveNote}`);
  } catch (err) {
    console.error('test_live error:', err.message);
    await interaction.editReply(`Error: ${err.message}`);
  }
}

module.exports = { handleTestInteraction };
