const { XMLParser } = require('fast-xml-parser');
const { sendVideoNotification, sendLiveNotification } = require('./discordNotifier');
const { version } = require('../package.json');
const { getAllWatchers, getWatcherState } = require('./watcherStore');

const parser = new XMLParser();

async function isLiveVideo(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; u2bot/${version})` },
    });
    if (!res.ok) return false;
    const html = await res.text();

    // Scope the check to ytInitialPlayerResponse so we only inspect the
    // target video's own metadata, not related/recommended videos on the page.
    const marker = 'ytInitialPlayerResponse';
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) return false;

    // Bound the search to the player response variable, ending at the next
    // variable declaration or closing script tag to avoid bleeding into
    // ytInitialData (which contains related/recommended video metadata).
    const rest = html.substring(startIdx);
    const endIdx = rest.search(/;\s*(?:var\s|<\/script)/);
    const section = endIdx > 0 ? rest.substring(0, endIdx) : rest.substring(0, 5000);

    // Primary: original check (works when YouTube serves the full player response)
    if (
      /"isLiveContent"\s*:\s*true/.test(section) &&
      /"isLive"\s*:\s*true/.test(section)
    ) {
      return true;
    }

    // Fallback: tracking params (works even with LOGIN_REQUIRED stub)
    return /"is_viewed_live","value":"True"/.test(section);
  } catch (err) {
    console.error(`Live check error for ${videoId}:`, err.message);
    return false;
  }
}

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

async function fetchFeedEntries(ytChannelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`;

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

async function fetchLatestVideo(ytChannelId) {
  const result = await fetchFeedEntries(ytChannelId);
  if (!result || result.entries.length === 0) return null;
  return entryToVideoData(result.entries[0], result.author);
}

async function pollRssFeedForWatcher(client, watcher, watcherState, config) {
  const result = await fetchFeedEntries(watcher.id);

  if (result === null) {
    watcherState.lastRssPollAt = new Date();
    watcherState.lastRssPollOk = false;
    return;
  }

  const { author, entries: entryList } = result;

  if (author) watcherState.channelName = author;

  if (entryList.length === 0) {
    console.log(`RSS [${watcher.label || watcher.id}]: No entries found in feed.`);
    watcherState.lastRssPollAt = new Date();
    watcherState.lastRssPollOk = true;
    return;
  }

  if (watcherState.isFirstRun) {
    for (const entry of entryList) {
      const videoId = entry['yt:videoId'];
      if (videoId) watcherState.seenVideoIds.add(videoId);
    }
    console.log(`RSS [${watcher.label || watcher.id}]: First run — seeded ${watcherState.seenVideoIds.size} existing video IDs.`);
    watcherState.isFirstRun = false;
    watcherState.lastRssPollAt = new Date();
    watcherState.lastRssPollOk = true;
    watcherState.seenVideoCount = watcherState.seenVideoIds.size;
    return;
  }

  const channel = await client.channels.fetch(watcher.discordChannelId);
  if (!channel) {
    console.error(`Could not fetch Discord channel: ${watcher.discordChannelId}`);
    watcherState.lastRssPollAt = new Date();
    watcherState.lastRssPollOk = false;
    return;
  }

  // Process pending videos — notify after 2 poll cycles to allow YouTube
  // time to update isLive metadata on the watch page.
  for (const [videoId, pending] of watcherState.pendingVideoIds) {
    pending.pollsSeen++;
    if (pending.pollsSeen < 2) {
      console.log(`RSS [${watcher.label || watcher.id}]: ${videoId} pending (cycle ${pending.pollsSeen}/2).`);
      continue;
    }

    const live = await isLiveVideo(videoId);
    try {
      if (live) {
        console.log(`RSS [${watcher.label || watcher.id}]: ${videoId} detected as live stream.`);
        await sendLiveNotification(channel, pending.videoData, config);
      } else {
        await sendVideoNotification(channel, pending.videoData, config);
      }
    } catch (err) {
      console.error(`Failed to send notification for ${videoId}:`, err.message);
    }
    watcherState.pendingVideoIds.delete(videoId);
  }

  // Queue new videos as pending (will be checked after 2 poll cycles)
  for (const entry of entryList) {
    const videoId = entry['yt:videoId'];
    if (!videoId || watcherState.seenVideoIds.has(videoId)) continue;

    watcherState.seenVideoIds.add(videoId);
    const videoData = entryToVideoData(entry, author);
    watcherState.pendingVideoIds.set(videoId, { videoData, pollsSeen: 0 });
    console.log(`RSS [${watcher.label || watcher.id}]: ${videoId} queued as pending (deferred live check).`);
  }

  console.log(`RSS [${watcher.label || watcher.id}]: OK — ${entryList.length} entries, ${watcherState.seenVideoIds.size} tracked.`);
  watcherState.lastRssPollAt = new Date();
  watcherState.lastRssPollOk = true;
  watcherState.seenVideoCount = watcherState.seenVideoIds.size;
}

async function pollAllWatchers(client, config) {
  const watchers = getAllWatchers();
  for (const watcher of watchers) {
    const state = getWatcherState(watcher.id);
    if (!state) continue;
    await pollRssFeedForWatcher(client, watcher, state, config);
  }
}

function startRssPoller(client, config) {
  const intervalMs = config.polling.rssFeedIntervalMinutes * 60 * 1000;
  console.log(`RSS poller started (every ${config.polling.rssFeedIntervalMinutes} min).`);

  // Run immediately, then on interval
  pollAllWatchers(client, config);
  return setInterval(() => pollAllWatchers(client, config), intervalMs);
}

module.exports = { startRssPoller, fetchLatestVideo, entryToVideoData, isLiveVideo, fetchFeedEntries, pollRssFeedForWatcher };
