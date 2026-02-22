const { Client, Events, GatewayIntentBits } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const state = require('./botState');
const { loadWatchers, addWatcher, getWatcher, initWatcherState, getAllWatchers } = require('./watcherStore');
const { startRssPoller } = require('./rssPoller');
const { startHealthServer } = require('./healthCheck');
const { registerCommands, handleStatusInteraction } = require('./statusCommand');
const { handleTestInteraction } = require('./testCommands');
const { handleWatcherInteraction } = require('./watcherCommands');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

let rssInterval;

client.once(Events.ClientReady, async () => {
  console.log(`u2bot v${version} — Logged in as ${client.user.tag}`);
  state.startedAt = new Date();

  // Load persisted watchers
  loadWatchers();

  // Migrate from legacy config if needed
  if (config.youtube?.channelId && !getWatcher(config.youtube.channelId)) {
    const discordChannelId = config.discord?.videoChannelId;
    if (discordChannelId) {
      addWatcher(config.youtube.channelId, discordChannelId, '');
      console.log(`Migrated legacy config watcher: ${config.youtube.channelId} → <#${discordChannelId}>`);
    }
  }

  // Initialize runtime state for each watcher
  for (const watcher of getAllWatchers()) {
    initWatcherState(watcher.id);
  }

  rssInterval = startRssPoller(client, config);
  await registerCommands(client.user.id);
  startHealthServer();
});

client.on(Events.InteractionCreate, handleStatusInteraction);
client.on(Events.InteractionCreate, handleTestInteraction);
client.on(Events.InteractionCreate, handleWatcherInteraction);

function shutdown() {
  console.log('Shutting down...');
  clearInterval(rssInterval);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discord.token);
