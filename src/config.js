const { readFileSync } = require('fs');
const { join } = require('path');

const CONFIG_PATH = join(__dirname, '..', 'config.json');

let config;
try {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  config = JSON.parse(raw);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('config.json not found. Copy config.example.json to config.json and fill in your values.');
  } else {
    console.error('Failed to parse config.json:', err.message);
  }
  process.exit(1);
}

const required = [
  ['discord.token', config.discord?.token],
];

for (const [name, value] of required) {
  if (!value) {
    console.error(`Missing required config field: ${name}`);
    process.exit(1);
  }
}

// Apply defaults for optional fields
config.discord.guildId = config.discord.guildId ?? '';
config.discord.autoPublish = config.discord.autoPublish ?? false;
config.polling = config.polling ?? {};
config.polling.rssFeedIntervalMinutes = config.polling.rssFeedIntervalMinutes ?? 3;
config.healthCheckPort = config.healthCheckPort ?? 3000;
config.messages = config.messages ?? {};
config.messages.video = config.messages.video ?? { content: "🎬 **{author}** just uploaded a new video!\n**{title}**\n{url}" };
config.messages.live = config.messages.live ?? { content: "🔴 **{author}** is live right now!\n**{title}**\n{url}" };

module.exports = config;
