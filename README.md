# u2bot

YouTube-to-Discord notification bot. Posts to Discord when a channel uploads a new video or goes live.

## Prerequisites

- Docker (recommended) **or** Node.js >= 18
- A Discord bot token ([create one here](https://discord.com/developers/applications))
- The YouTube channel ID you want to monitor (starts with `UC`)

## Quick Start

```bash
git clone https://github.com/fumb13s/u2bot.git && cd u2bot
cp config.example.json config.json  # edit with your values
docker compose up -d
```

If you have Node.js installed, you can use the interactive setup wizard instead of editing the file by hand:

```bash
npm run setup                # creates config.json interactively
docker compose up -d
```

### Running without Docker

```bash
npm run setup   # or: cp config.example.json config.json
npm start
```

## Configuration

### Interactive setup (recommended)

```bash
npm run setup
```

Walks you through every required value with explanations and sensible defaults.

### Manual setup

```bash
cp config.example.json config.json
```

Edit `config.json`:

| Field | Required | Description |
|---|---|---|
| `discord.token` | yes | Bot token from the Discord developer portal |
| `discord.videoChannelId` | yes | Channel ID for new-video notifications |
| `discord.liveChannelId` | yes | Channel ID for live-stream notifications |
| `youtube.channelId` | yes | YouTube channel ID (`UC...`) |
| `discord.autoPublish` | no | Auto-publish in announcement channels (default: `true`) |
| `polling.rssFeedIntervalMinutes` | no | How often to poll the RSS feed (default: `3`) |
| `polling.liveCheckIntervalMinutes` | no | How often to check live status (default: `2`) |
| `messages.video` | no | Customizable video notification template |
| `messages.live` | no | Customizable live notification template |

Message templates support `{title}`, `{url}`, and `{date}` placeholders.

## Deployment with Docker

Recommended for shared/VPS environments. The container is capped at 128 MB RAM.

Make sure `config.json` exists first (see [Configuration](#configuration)), then:

```bash
docker compose up -d         # build image & start container
docker compose logs -f       # tail logs
docker compose down          # stop
docker compose up -d --build # rebuild after updates
```

`config.json` is bind-mounted into the container, so you can edit it in place and restart:

```bash
docker compose restart
```

## Updating

Pull the latest code and redeploy with the update script:

```bash
bash scripts/update.sh
```

This runs `git pull`, rebuilds the Docker image, restarts the container, and prints the old and new version numbers.

## Project Structure

```
u2bot/
  src/
    index.js            # entry point — starts Discord client and pollers
    config.js           # loads and validates config.json
    rssPoller.js        # polls YouTube RSS feed for new videos
    liveChecker.js      # checks if the channel is currently live
    discordNotifier.js  # sends embed messages to Discord
  config.example.json   # template configuration
  setup.js              # interactive setup wizard
  Dockerfile
  docker-compose.yml
```
