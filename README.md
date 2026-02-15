# u2bot

YouTube-to-Discord notification bot. Posts to Discord when a channel uploads a new video or goes live.

## Prerequisites

- Docker (recommended) **or** Node.js >= 18
- A Discord bot with a token (see [Creating the Discord Bot](#creating-the-discord-bot) below)
- The YouTube channel ID you want to monitor (starts with `UC`)

### Installing on a fresh VPS

Install Docker (recommended):

```bash
curl -fsSL https://get.docker.com | sh
```

Or install Node.js if running without Docker:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
```

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
npm install                 # install dependencies
npm run setup               # or: cp config.example.json config.json
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
| `healthCheckPort` | no | Port for the `/healthz` endpoint (default: `3000`) |
| `polling.rssFeedIntervalMinutes` | no | How often to poll the RSS feed (default: `3`) |
| `polling.liveCheckIntervalMinutes` | no | How often to check live status (default: `2`) |
| `messages.video` | no | Customizable video notification template |
| `messages.live` | no | Customizable live notification template |

Message templates support `{title}`, `{url}`, and `{date}` placeholders.

## Creating the Discord Bot

### 1. Create the application and bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name (e.g. "u2bot"), and click **Create**
3. In the left sidebar, go to **Bot**
4. Click **Reset Token** and copy the token — this is the `discord.token` value for your config
5. Under **Privileged Gateway Intents**, no special intents are needed — the defaults are fine

### 2. Invite the bot to your server

1. In the left sidebar, go to **OAuth2**
2. Under **OAuth2 URL Generator**, select these **scopes**:
   - `bot`
   - `applications.commands` (required for the `/status` slash command)
3. In the **Bot Permissions** section that appears below, select:
   - **Send Messages**
   - **Embed Links**
   - **Manage Messages** (only needed if `autoPublish` is `true` and you use announcement channels)
4. Copy the generated URL at the bottom of the page
5. Open the URL in your browser, select the server you want to add the bot to, and click **Authorize**

If the bot was previously invited without the `applications.commands` scope, open the new URL and re-authorize — Discord will add the missing scope without removing the bot or its roles.

### 3. Get channel IDs

You need Discord channel IDs for the config (`videoChannelId` and `liveChannelId`):

1. Open Discord and go to **Settings > Advanced > Developer Mode** — turn it on
2. Right-click the channel you want notifications posted in and click **Copy Channel ID**

## Deployment with Docker

Recommended for shared/VPS environments. The container is capped at 128 MB RAM.

Make sure `config.json` exists first (see [Configuration](#configuration)), then:

```bash
docker compose up -d         # build image & start container
docker compose logs -f       # tail logs
docker compose ps            # check container health status
docker compose down          # stop
docker compose up -d --build # rebuild after updates
```

The Docker image includes a health check that hits `/healthz` every 30 seconds. After ~30s you should see `(healthy)` in `docker compose ps`.

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
    botState.js         # shared runtime state for health/status reporting
    healthCheck.js      # HTTP server exposing /healthz for Docker health checks
    statusCommand.js    # Discord /status slash command
    rssPoller.js        # polls YouTube RSS feed for new videos
    liveChecker.js      # checks if the channel is currently live
    discordNotifier.js  # sends embed messages to Discord
  config.example.json   # template configuration
  setup.js              # interactive setup wizard
  Dockerfile
  docker-compose.yml
```
