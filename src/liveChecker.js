const { sendLiveNotification } = require('./discordNotifier');
const { version } = require('../package.json');
const state = require('./botState');

let isCurrentlyLive = false;

async function fetchLiveStatus(config) {
  const liveUrl = `https://www.youtube.com/channel/${config.youtube.channelId}/live`;

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

  const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/);
  const title = titleMatch ? titleMatch[1] : 'Live Stream';

  return {
    isLive,
    videoId: videoId || 'unknown',
    title,
    author: state.channelName || '',
    url: videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : liveUrl,
    date: new Date().toLocaleDateString(),
  };
}

async function checkLiveStatus(client, config) {
  const result = await fetchLiveStatus(config);

  if (result === null) {
    state.lastLiveCheckAt = new Date();
    state.lastLiveCheckOk = false;
    return;
  }

  if (result.isLive && !isCurrentlyLive) {
    isCurrentlyLive = true;

    const channel = await client.channels.fetch(config.discord.liveChannelId);
    if (!channel) {
      console.error(`Could not fetch Discord channel: ${config.discord.liveChannelId}`);
      state.lastLiveCheckAt = new Date();
      state.lastLiveCheckOk = false;
      return;
    }

    try {
      await sendLiveNotification(channel, result, config);
    } catch (err) {
      console.error('Failed to send live notification:', err.message);
    }
  } else if (!result.isLive && isCurrentlyLive) {
    isCurrentlyLive = false;
    console.log('Live stream has ended.');
  }

  state.lastLiveCheckAt = new Date();
  state.lastLiveCheckOk = true;
  state.isCurrentlyLive = isCurrentlyLive;
}

function startLiveChecker(client, config) {
  const intervalMs = config.polling.liveCheckIntervalMinutes * 60 * 1000;
  console.log(`Live checker started (every ${config.polling.liveCheckIntervalMinutes} min).`);

  // Run immediately, then on interval
  checkLiveStatus(client, config);
  return setInterval(() => checkLiveStatus(client, config), intervalMs);
}

module.exports = { startLiveChecker, fetchLiveStatus };
