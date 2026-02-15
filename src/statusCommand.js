const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const state = require('./botState');

const STATUS_COMMAND = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot health and status');

async function registerCommands(clientId) {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: [STATUS_COMMAND.toJSON()],
  });
  console.log('Registered /status slash command.');
}

function isPollerHealthy(lastPollAt, intervalMinutes) {
  if (!lastPollAt) return false;
  const maxAge = intervalMinutes * 2 * 60 * 1000;
  return Date.now() - lastPollAt.getTime() < maxAge;
}

function formatTimestamp(date) {
  if (!date) return 'never';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

async function handleStatusInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'status') return;

  const rssHealthy = isPollerHealthy(state.lastRssPollAt, config.polling.rssFeedIntervalMinutes);
  const liveHealthy = isPollerHealthy(state.lastLiveCheckAt, config.polling.liveCheckIntervalMinutes);
  const allHealthy = rssHealthy && liveHealthy;

  const uptimeSeconds = state.startedAt ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000) : 0;
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  const rssStatus = state.lastRssPollAt
    ? `${state.lastRssPollOk ? 'OK' : 'Error'} — ${formatTimestamp(state.lastRssPollAt)}`
    : 'Not yet polled';

  const liveStatus = state.lastLiveCheckAt
    ? `${state.lastLiveCheckOk ? 'OK' : 'Error'} — ${formatTimestamp(state.lastLiveCheckAt)}`
    : 'Not yet checked';

  const embed = {
    title: 'u2bot Status',
    color: allHealthy ? 0x00cc00 : 0xcc0000,
    fields: [
      { name: 'Version', value: `v${version}`, inline: true },
      { name: 'Uptime', value: uptimeStr, inline: true },
      { name: 'Currently Live', value: state.isCurrentlyLive ? 'Yes' : 'No', inline: true },
      { name: 'RSS Poller', value: rssStatus, inline: false },
      { name: 'Live Checker', value: liveStatus, inline: false },
      { name: 'Tracked Videos', value: String(state.seenVideoCount), inline: true },
    ],
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { registerCommands, handleStatusInteraction };
