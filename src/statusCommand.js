const { MessageFlags, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const state = require('./botState');
const { getAllWatchers, getWatcherState } = require('./watcherStore');
const { watcherCommandBuilders } = require('./watcherCommands');

const STATUS_COMMAND = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot health and status');

const TEST_VIDEO_COMMAND = new SlashCommandBuilder()
  .setName('test_video')
  .setDescription('Send a test video notification using the latest RSS entry')
  .addStringOption((opt) =>
    opt.setName('channel_id').setDescription('YouTube channel ID (optional if only one watcher)').setRequired(false),
  );

async function registerCommands(clientId) {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: [
      STATUS_COMMAND.toJSON(),
      TEST_VIDEO_COMMAND.toJSON(),
      ...watcherCommandBuilders.map((cmd) => cmd.toJSON()),
    ],
  });
  console.log('Registered slash commands: /status, /test_video, /watch, /unwatch, /watchers, /watcher');
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

  const watchers = getAllWatchers();
  const watcherCount = watchers.length;

  let allHealthy = true;
  const watcherLines = [];

  for (const watcher of watchers) {
    const ws = getWatcherState(watcher.id);
    const name = ws?.channelName || watcher.label || watcher.id;
    const rssOk = ws ? isPollerHealthy(ws.lastRssPollAt, config.polling.rssFeedIntervalMinutes) : false;
    const healthy = rssOk;
    if (!healthy) allHealthy = false;
    watcherLines.push(`${healthy ? 'OK' : 'Error'} — **${name}** → <#${watcher.discordChannelId}>`);
  }

  if (watcherCount === 0) allHealthy = true;

  const uptimeSeconds = state.startedAt ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000) : 0;
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  const fields = [
    { name: 'Version', value: `v${version}`, inline: true },
    { name: 'Uptime', value: uptimeStr, inline: true },
    { name: 'Watchers', value: String(watcherCount), inline: true },
  ];

  if (watcherCount > 0 && watcherCount <= 5) {
    fields.push({ name: 'Watcher Status', value: watcherLines.join('\n'), inline: false });
  } else if (watcherCount > 5) {
    const healthyCount = watcherLines.filter((l) => l.startsWith('OK')).length;
    fields.push({
      name: 'Watcher Status',
      value: `${healthyCount}/${watcherCount} healthy — use \`/watchers\` for details`,
      inline: false,
    });
  }

  const embed = {
    title: 'u2bot Status',
    color: allHealthy ? 0x00cc00 : 0xcc0000,
    fields,
  };

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { registerCommands, handleStatusInteraction };
