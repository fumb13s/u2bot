const { XMLParser } = require('fast-xml-parser');
const { sendVideoNotification } = require('./discordNotifier');

const parser = new XMLParser();
const seenVideoIds = new Set();
let isFirstRun = true;

async function pollRssFeed(client, config) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${config.youtube.channelId}`;

  let xml;
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.error(`RSS fetch failed: ${res.status} ${res.statusText}`);
      return;
    }
    xml = await res.text();
  } catch (err) {
    console.error('RSS fetch error:', err.message);
    return;
  }

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    console.error('RSS parse error:', err.message);
    return;
  }

  const entries = parsed?.feed?.entry;
  if (!entries) {
    console.log('RSS: No entries found in feed.');
    return;
  }

  // Normalize to array (single entry comes as object)
  const entryList = Array.isArray(entries) ? entries : [entries];

  if (isFirstRun) {
    for (const entry of entryList) {
      const videoId = entry['yt:videoId'];
      if (videoId) seenVideoIds.add(videoId);
    }
    console.log(`RSS: First run — seeded ${seenVideoIds.size} existing video IDs.`);
    isFirstRun = false;
    return;
  }

  const channel = await client.channels.fetch(config.discord.videoChannelId);
  if (!channel) {
    console.error(`Could not fetch Discord channel: ${config.discord.videoChannelId}`);
    return;
  }

  for (const entry of entryList) {
    const videoId = entry['yt:videoId'];
    if (!videoId || seenVideoIds.has(videoId)) continue;

    seenVideoIds.add(videoId);

    const videoData = {
      videoId,
      title: entry.title || 'Untitled',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      date: entry.published
        ? new Date(entry.published).toLocaleDateString()
        : new Date().toLocaleDateString(),
    };

    try {
      await sendVideoNotification(channel, videoData, config);
    } catch (err) {
      console.error(`Failed to send video notification for ${videoId}:`, err.message);
    }
  }
}

function startRssPoller(client, config) {
  const intervalMs = config.polling.rssFeedIntervalMinutes * 60 * 1000;
  console.log(`RSS poller started (every ${config.polling.rssFeedIntervalMinutes} min).`);

  // Run immediately, then on interval
  pollRssFeed(client, config);
  return setInterval(() => pollRssFeed(client, config), intervalMs);
}

module.exports = { startRssPoller };
