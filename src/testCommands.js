const { MessageFlags } = require('discord.js');
const { fetchLatestVideo } = require('./rssPoller');
const { fetchLiveStatus } = require('./liveChecker');
const { sendVideoNotification, sendLiveNotification } = require('./discordNotifier');
const config = require('./config');

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

  try {
    const videoData = await fetchLatestVideo(config);
    if (!videoData) {
      await interaction.editReply('Could not fetch the latest video from the RSS feed.');
      return;
    }

    const channel = await interaction.client.channels.fetch(config.discord.videoChannelId);
    if (!channel) {
      await interaction.editReply(`Could not fetch Discord channel: ${config.discord.videoChannelId}`);
      return;
    }

    await sendVideoNotification(channel, videoData, config);
    await interaction.editReply(`Test video notification sent to <#${config.discord.videoChannelId}> for: **${videoData.title}**`);
  } catch (err) {
    console.error('test_video error:', err.message);
    await interaction.editReply(`Error: ${err.message}`);
  }
}

async function handleTestLive(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await fetchLiveStatus(config);
    if (result === null || result.videoId === 'unknown') {
      await interaction.editReply('Could not fetch live stream info from YouTube.');
      return;
    }

    const channel = await interaction.client.channels.fetch(config.discord.liveChannelId);
    if (!channel) {
      await interaction.editReply(`Could not fetch Discord channel: ${config.discord.liveChannelId}`);
      return;
    }

    await sendLiveNotification(channel, result, config);
    const liveNote = result.isLive ? ' (currently live)' : ' (not currently live)';
    await interaction.editReply(`Test live notification sent to <#${config.discord.liveChannelId}> for: **${result.title}**${liveNote}`);
  } catch (err) {
    console.error('test_live error:', err.message);
    await interaction.editReply(`Error: ${err.message}`);
  }
}

module.exports = { handleTestInteraction };
