const { EmbedBuilder } = require('discord.js');

function applyTemplate(str, vars) {
  return str
    .replace(/\{title\}/g, vars.title)
    .replace(/\{url\}/g, vars.url)
    .replace(/\{date\}/g, vars.date);
}

function buildEmbed(template, vars, thumbnailUrl) {
  const embed = new EmbedBuilder();

  if (template.title) embed.setTitle(applyTemplate(template.title, vars));
  if (template.url) embed.setURL(applyTemplate(template.url, vars));
  if (template.description) embed.setDescription(applyTemplate(template.description, vars));
  if (template.color != null) embed.setColor(template.color);
  if (thumbnailUrl) embed.setImage(thumbnailUrl);

  return embed;
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
    url: videoData.url,
    date: videoData.date,
  };
  const template = config.messages.video;
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoData.videoId}/maxresdefault.jpg`;
  const embed = buildEmbed(template.embed, vars, thumbnailUrl);

  const text = template.content ? applyTemplate(template.content, vars) : '';
  const content = text ? `${text}\n${videoData.url}` : videoData.url;
  const message = await channel.send({ content, embeds: [embed] });
  console.log(`Sent video notification: ${videoData.title}`);
  await tryCrosspost(message, config);
}

async function sendLiveNotification(channel, streamData, config) {
  const vars = {
    title: streamData.title,
    url: streamData.url,
    date: streamData.date,
  };
  const template = config.messages.live;
  const thumbnailUrl = `https://i.ytimg.com/vi/${streamData.videoId}/hqdefault_live.jpg`;
  const embed = buildEmbed(template.embed, vars, thumbnailUrl);

  const text = template.content ? applyTemplate(template.content, vars) : '';
  const content = text ? `${text}\n${streamData.url}` : streamData.url;
  const message = await channel.send({ content, embeds: [embed] });
  console.log(`Sent live notification: ${streamData.title}`);
  await tryCrosspost(message, config);
}

module.exports = { sendVideoNotification, sendLiveNotification };
