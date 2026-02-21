const { sendLiveNotification } = require('./discordNotifier');
const { version } = require('../package.json');
const { getAllWatchers, getWatcherState } = require('./watcherStore');

async function fetchLiveStatus(ytChannelId, channelName) {
  const liveUrl = `https://www.youtube.com/channel/${ytChannelId}/live`;

  let html;
  try {
    const res = await fetch(liveUrl, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; u2bot/${version})` },
    });
    if (!res.ok) {
      console.error(`Live check fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.error('Live check fetch error:', err.message);
    return null;
  }

  const liveIndicators = [
    /"isLive"\s*:\s*true/,
    /hqdefault_live\.jpg/,
    /"style"\s*:\s*"LIVE"/,
  ];

  const isLive = liveIndicators.some((pattern) => pattern.test(html));

  const videoIdMatch = html.match(/(?:"videoId"\s*:\s*"|\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  // Use YouTube's oEmbed API for a reliable video title — scraping the HTML
  // is fragile (localized UI labels, consent walls, varying page structure).
  let title = 'Live Stream';
  if (videoId) {
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        if (data.title) title = data.title;
      }
    } catch (err) {
      console.error('Failed to fetch video title:', err.message);
    }
  }

  return {
    isLive,
    videoId: videoId || 'unknown',
    title,
    author: channelName || '',
    url: videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : liveUrl,
    date: new Date().toLocaleDateString(),
  };
}

async function checkLiveForWatcher(client, watcher, watcherState, config) {
  const result = await fetchLiveStatus(watcher.id, watcherState.channelName);

  if (result === null) {
    watcherState.lastLiveCheckAt = new Date();
    watcherState.lastLiveCheckOk = false;
    return;
  }

  if (result.isLive && !watcherState.isCurrentlyLive) {
    watcherState.isCurrentlyLive = true;
    if (result.videoId && result.videoId !== 'unknown') {
      watcherState.liveVideoIds.add(result.videoId);
    }

    const channel = await client.channels.fetch(watcher.discordChannelId);
    if (!channel) {
      console.error(`Could not fetch Discord channel: ${watcher.discordChannelId}`);
      watcherState.lastLiveCheckAt = new Date();
      watcherState.lastLiveCheckOk = false;
      return;
    }

    try {
      await sendLiveNotification(channel, result, config);
    } catch (err) {
      console.error('Failed to send live notification:', err.message);
    }
  } else if (!result.isLive && watcherState.isCurrentlyLive) {
    watcherState.isCurrentlyLive = false;
    console.log(`Live [${watcher.label || watcher.id}]: Stream has ended.`);
  }

  console.log(`Live [${watcher.label || watcher.id}]: OK — ${watcherState.isCurrentlyLive ? 'live' : 'not live'}.`);
  watcherState.lastLiveCheckAt = new Date();
  watcherState.lastLiveCheckOk = true;
}

async function checkAllWatchers(client, config) {
  const watchers = getAllWatchers();
  for (const watcher of watchers) {
    const state = getWatcherState(watcher.id);
    if (!state) continue;
    await checkLiveForWatcher(client, watcher, state, config);
  }
}

function startLiveChecker(client, config) {
  const intervalMs = config.polling.liveCheckIntervalMinutes * 60 * 1000;
  console.log(`Live checker started (every ${config.polling.liveCheckIntervalMinutes} min).`);

  // Run immediately, then on interval
  checkAllWatchers(client, config);
  return setInterval(() => checkAllWatchers(client, config), intervalMs);
}

async function isVideoLive(videoId, ytChannelId, channelName) {
  const result = await fetchLiveStatus(ytChannelId, channelName);
  if (!result) return false;
  return result.isLive && result.videoId === videoId;
}

module.exports = { startLiveChecker, fetchLiveStatus, isVideoLive };
