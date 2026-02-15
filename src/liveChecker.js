const { sendLiveNotification } = require('./discordNotifier');

let isCurrentlyLive = false;

async function checkLiveStatus(client, config) {
  const liveUrl = `https://www.youtube.com/channel/${config.youtube.channelId}/live`;

  let html;
  try {
    const res = await fetch(liveUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; u2bot/1.0)' },
    });
    if (!res.ok) {
      console.error(`Live check fetch failed: ${res.status} ${res.statusText}`);
      return;
    }
    html = await res.text();
  } catch (err) {
    console.error('Live check fetch error:', err.message);
    return;
  }

  const liveIndicators = [
    /"isLive"\s*:\s*true/,
    /hqdefault_live\.jpg/,
    /"style"\s*:\s*"LIVE"/,
  ];

  const isLive = liveIndicators.some((pattern) => pattern.test(html));

  if (isLive && !isCurrentlyLive) {
    isCurrentlyLive = true;

    // Extract video ID
    const videoIdMatch = html.match(/(?:"videoId"\s*:\s*"|\/watch\?v=)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    // Extract stream title
    const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : 'Live Stream';

    const streamData = {
      videoId: videoId || 'unknown',
      title,
      url: videoId
        ? `https://www.youtube.com/watch?v=${videoId}`
        : liveUrl,
      date: new Date().toLocaleDateString(),
    };

    const channel = await client.channels.fetch(config.discord.liveChannelId);
    if (!channel) {
      console.error(`Could not fetch Discord channel: ${config.discord.liveChannelId}`);
      return;
    }

    try {
      await sendLiveNotification(channel, streamData, config);
    } catch (err) {
      console.error('Failed to send live notification:', err.message);
    }
  } else if (!isLive && isCurrentlyLive) {
    isCurrentlyLive = false;
    console.log('Live stream has ended.');
  }
}

function startLiveChecker(client, config) {
  const intervalMs = config.polling.liveCheckIntervalMinutes * 60 * 1000;
  console.log(`Live checker started (every ${config.polling.liveCheckIntervalMinutes} min).`);

  // Run immediately, then on interval
  checkLiveStatus(client, config);
  return setInterval(() => checkLiveStatus(client, config), intervalMs);
}

module.exports = { startLiveChecker };
