const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { startRssPoller } = require('./rssPoller');
const { startLiveChecker } = require('./liveChecker');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

let rssInterval;
let liveInterval;

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  rssInterval = startRssPoller(client, config);
  liveInterval = startLiveChecker(client, config);
});

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
