const { Client, Events, GatewayIntentBits } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const state = require('./botState');
const { startRssPoller } = require('./rssPoller');
const { startLiveChecker } = require('./liveChecker');
const { startHealthServer } = require('./healthCheck');
const { registerCommands, handleStatusInteraction } = require('./statusCommand');
const { handleTestInteraction } = require('./testCommands');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

let rssInterval;
let liveInterval;

client.once('ready', async () => {
  console.log(`u2bot v${version} — Logged in as ${client.user.tag}`);
  state.startedAt = new Date();
  rssInterval = startRssPoller(client, config);
  liveInterval = startLiveChecker(client, config);
  await registerCommands(client.user.id);
  startHealthServer();
});

client.on(Events.InteractionCreate, handleStatusInteraction);
client.on(Events.InteractionCreate, handleTestInteraction);

function shutdown() {
  console.log('Shutting down...');
  clearInterval(rssInterval);
  clearInterval(liveInterval);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discord.token);
