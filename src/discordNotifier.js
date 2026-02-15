function applyTemplate(str, vars) {
  return str
    .replace(/\{title\}/g, vars.title)
    .replace(/\{author\}/g, vars.author)
    .replace(/\{url\}/g, vars.url)
    .replace(/\{date\}/g, vars.date);
}

async function tryCrosspost(message, config) {
  if (!config.discord.autoPublish) return;
  try {
    await message.crosspost();
    console.log('Message auto-published.');
  } catch (err) {
    // 50021 = "This message was not sent in an announcement channel"
    if (err.code === 50021) {
      console.log('Channel is not an announcement channel, skipping crosspost.');
    } else {
      console.error('Failed to crosspost message:', err.message);
    }
  }
}

async function sendVideoNotification(channel, videoData, config) {
  const vars = {
    title: videoData.title,
    author: videoData.author || '',
    url: videoData.url,
    date: videoData.date,
  };
  const template = config.messages.video;

  const content = template.content ? applyTemplate(template.content, vars) : videoData.url;
  const message = await channel.send({ content });
  console.log(`Sent video notification: ${videoData.title}`);
  await tryCrosspost(message, config);
}

async function sendLiveNotification(channel, streamData, config) {
  const vars = {
    title: streamData.title,
    author: streamData.author || '',
    url: streamData.url,
    date: streamData.date,
  };
  const template = config.messages.live;

  const content = template.content ? applyTemplate(template.content, vars) : streamData.url;
  const message = await channel.send({ content });
  console.log(`Sent live notification: ${streamData.title}`);
  await tryCrosspost(message, config);
}

module.exports = { sendVideoNotification, sendLiveNotification };
