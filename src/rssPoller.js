const { XMLParser } = require('fast-xml-parser');
const { sendVideoNotification } = require('./discordNotifier');
const { isVideoLive } = require('./liveChecker');
const { version } = require('../package.json');
const state = require('./botState');

const parser = new XMLParser();
const seenVideoIds = new Set();
let isFirstRun = true;

function entryToVideoData(entry, author) {
  const videoId = entry['yt:videoId'];
  return {
    videoId,
    title: entry.title || 'Untitled',
    author: author || entry?.author?.name || '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    date: entry.published
      ? new Date(entry.published).toLocaleDateString()
      : new Date().toLocaleDateString(),
  };
}

async function fetchFeedEntries(config) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${config.youtube.channelId}`;

  let xml;
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; u2bot/${version})` },
    });
    if (!res.ok) {
      console.error(`RSS fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    xml = await res.text();
  } catch (err) {
    console.error('RSS fetch error:', err.message);
    return null;
  }

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    console.error('RSS parse error:', err.message);
    return null;
  }

  const author = parsed?.feed?.author?.name || '';
  const entries = parsed?.feed?.entry;
  if (!entries) return { author, entries: [] };

  const entryList = Array.isArray(entries) ? entries : [entries];
  return { author, entries: entryList };
}

async function fetchLatestVideo(config) {
  const result = await fetchFeedEntries(config);
  if (!result || result.entries.length === 0) return null;
  return entryToVideoData(result.entries[0], result.author);
}

async function pollRssFeed(client, config) {
  const result = await fetchFeedEntries(config);

  if (result === null) {
    state.lastRssPollAt = new Date();
    state.lastRssPollOk = false;
    return;
  }

  const { author, entries: entryList } = result;

  if (author) state.channelName = author;

  if (entryList.length === 0) {
    console.log('RSS: No entries found in feed.');
    state.lastRssPollAt = new Date();
    state.lastRssPollOk = true;
    return;
  }

  if (isFirstRun) {
    for (const entry of entryList) {
      const videoId = entry['yt:videoId'];
      if (videoId) seenVideoIds.add(videoId);
    }
    console.log(`RSS: First run — seeded ${seenVideoIds.size} existing video IDs.`);
    isFirstRun = false;
    state.lastRssPollAt = new Date();
    state.lastRssPollOk = true;
    state.seenVideoCount = seenVideoIds.size;
    return;
  }

  const channel = await client.channels.fetch(config.discord.videoChannelId);
  if (!channel) {
    console.error(`Could not fetch Discord channel: ${config.discord.videoChannelId}`);
    state.lastRssPollAt = new Date();
    state.lastRssPollOk = false;
    return;
  }

  for (const entry of entryList) {
    const videoId = entry['yt:videoId'];
    if (!videoId || seenVideoIds.has(videoId)) continue;

    seenVideoIds.add(videoId);

    if (state.liveVideoIds.has(videoId)) {
      console.log(`RSS: Skipping ${videoId} — already flagged as live stream.`);
      continue;
    }

    if (await isVideoLive(videoId, config)) {
      state.liveVideoIds.add(videoId);
      console.log(`RSS: Skipping ${videoId} — detected as live stream.`);
      continue;
    }

    const videoData = entryToVideoData(entry, author);

    try {
      await sendVideoNotification(channel, videoData, config);
    } catch (err) {
      console.error(`Failed to send video notification for ${videoId}:`, err.message);
    }
  }

  console.log(`RSS: OK — ${entryList.length} entries, ${seenVideoIds.size} tracked.`);
  state.lastRssPollAt = new Date();
  state.lastRssPollOk = true;
  state.seenVideoCount = seenVideoIds.size;
}

function startRssPoller(client, config) {
  const intervalMs = config.polling.rssFeedIntervalMinutes * 60 * 1000;
  console.log(`RSS poller started (every ${config.polling.rssFeedIntervalMinutes} min).`);

  // Run immediately, then on interval
  pollRssFeed(client, config);
  return setInterval(() => pollRssFeed(client, config), intervalMs);
}

module.exports = { startRssPoller, fetchLatestVideo };
