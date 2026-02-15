# Implementation Plan: YouTube → Discord Notification Bot

## Goal

Build a self-hosted Node.js Discord bot that:

1. Posts a formatted message to a configurable Discord channel when a new YouTube video is uploaded
2. Posts a **differently formatted** message (same or different channel) when a live stream starts
3. Auto-publishes those messages if the target channel is a Discord announcement channel

No YouTube API key required. No third-party bot services.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Node.js Bot                          │
│                                                          │
│  ┌─────────────────┐       ┌──────────────────────────┐  │
│  │  RSS Poller      │       │  Live Stream Checker     │  │
│  │  (every ~3 min)  │       │  (every ~2 min)          │  │
│  │                  │       │                          │  │
│  │  Fetches YouTube │       │  Fetches channel page    │  │
│  │  RSS feed XML    │       │  and checks for live     │  │
│  │                  │       │  indicators in HTML      │  │
│  └───────┬──────────┘       └────────────┬─────────────┘  │
│          │                               │                │
│          ▼                               ▼                │
│  ┌───────────────────────────────────────────────────┐    │
│  │              Discord Notification Sender           │    │
│  │                                                    │    │
│  │  - Builds embed (video format or live format)      │    │
│  │  - Sends to configured channel                     │    │
│  │  - Calls .crosspost() for auto-publish             │    │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. RSS Feed Poller (new video detection)

**Source:** `https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}`

**How it works:**
- Fetches the YouTube RSS feed on a configurable interval (default: 3 minutes)
- Parses XML using `fast-xml-parser`
- Maintains an in-memory `Set` of seen video IDs
- On first run, loads existing video IDs without sending notifications (avoids spamming old videos on bot restart)
- On subsequent runs, any video ID not in the set triggers a "new video" notification

**Limitations:**
- YouTube RSS feeds can have a delay of a few minutes after a video is published
- Feed does not indicate whether a video is a regular upload, a short, or a live stream replay

### 2. Live Stream Checker

**Source:** `https://www.youtube.com/channel/{CHANNEL_ID}/live`

**How it works:**
- Fetches the channel's `/live` page on a configurable interval (default: 2 minutes)
- Checks the HTML response for known live indicators:
  - `"isLive":true` in the page's JSON data
  - `hqdefault_live.jpg` (live thumbnail marker)
  - `"style":"LIVE"` in the page data
- Extracts stream title and video ID from the page HTML using regex
- Tracks a boolean `isCurrentlyLive` state:
  - `false → true`: sends "going live" notification
  - `true → false`: logs that the stream ended (no notification by default)
- Only sends one notification per live session

**Limitations:**
- Relies on scraping YouTube's HTML — may break if YouTube changes their page structure
- 2-minute polling means up to 2 minutes of delay before detection
- Cannot detect scheduled/upcoming streams, only currently active ones

### 3. Discord Notification Sender

**How it works:**
- Uses `discord.js` v14 to connect to Discord via bot token
- Builds a `MessageEmbed` using configurable templates from `config.json`
- Supports template variables: `{title}`, `{url}`, `{date}`
- Automatically includes video thumbnail (`maxresdefault.jpg`)
- Sends to separate configurable channels for videos and live streams (can be the same channel)
- After sending, calls `message.crosspost()` to auto-publish in announcement channels
- Gracefully handles non-announcement channels (catches error code 50021)

---

## Configuration

All settings live in a single `config.json` file:

| Setting | Purpose |
|---|---|
| `discord.token` | Bot authentication token |
| `discord.videoChannelId` | Target channel for new video notifications |
| `discord.liveChannelId` | Target channel for live stream notifications |
| `discord.autoPublish` | Enable/disable auto-publishing |
| `youtube.channelId` | YouTube channel to monitor |
| `polling.rssFeedIntervalMinutes` | RSS check frequency |
| `polling.liveCheckIntervalMinutes` | Live check frequency |
| `messages.video` | Embed template for new video notifications |
| `messages.live` | Embed template for live stream notifications |

---

## Setup Steps (for you)

### Step 1: Create a Discord Bot Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → go to Bot tab → copy the token
3. Enable "Message Content Intent" under Privileged Gateway Intents
4. Generate an OAuth2 invite URL with permissions: Send Messages, Manage Messages, Embed Links, Mention Everyone
5. Invite the bot to your friend's server

### Step 2: Get IDs
- **YouTube Channel ID**: Find the `UC...` string from your channel page (not the `@handle`)
- **Discord Channel ID(s)**: Enable Developer Mode in Discord settings, then right-click channel → Copy Channel ID

### Step 3: Configure
- Copy `config.example.json` → `config.json`
- Fill in the token, channel IDs, and YouTube channel ID
- Customize the embed templates if desired

### Step 4: Install and Run
```bash
npm install
npm start
```

### Step 5: Production Deployment
- Use **pm2** or **systemd** to keep the bot running and auto-restart on crashes/reboots
- The README includes copy-paste instructions for both approaches

---

## Dependencies

| Package | Purpose | Why this one |
|---|---|---|
| `discord.js` v14 | Discord bot framework | Industry standard, well-maintained |
| `fast-xml-parser` | Parse YouTube RSS XML | Fast, zero-dependency, reliable |
| Node.js built-in `fetch` | HTTP requests | No extra dependency needed (Node 18+) |

---

## Hosting Options

The bot is lightweight (< 50MB RAM) and can run on:

| Option | Cost | Notes |
|---|---|---|
| Any VPS (Hetzner, DigitalOcean, etc.) | ~€3-5/mo | Most flexible, can run alongside other things |
| Raspberry Pi / home server | Free (electricity) | Works great, just needs stable internet |
| Oracle Cloud free tier | Free | 1 GB RAM ARM instance available permanently |
| Old laptop/desktop | Free | Fine for a single lightweight bot |

---

## Known Limitations and Risks

| Limitation | Impact | Mitigation |
|---|---|---|
| RSS feed delay | New videos may take 2-10 min to appear in the feed | Acceptable per your requirements |
| Live detection via scraping | Could break if YouTube changes HTML | Monitor logs; I can update the regex if needed |
| No persistent state | Restarting the bot re-initializes seen video IDs from the current feed | First-run logic prevents duplicate notifications for recent videos |
| YouTube rate limiting | Aggressive polling could get temporarily blocked | Default intervals (2-3 min) are conservative and safe |
| Auto-publish Discord limit | Max 10 published messages/hour/channel | Not an issue for YouTube notifications |

---

## Future Enhancements (if needed later)

- **Persistent state**: Save seen video IDs to a JSON file so restarts don't lose history
- **Shorts filtering**: Detect and optionally skip YouTube Shorts
- **Stream-end notification**: Post when a live stream ends
- **Custom thumbnails per type**: Use different thumbnail styles for videos vs. streams
- **Multiple YouTube channels**: Monitor more than one channel
- **Webhook mode**: Use Discord webhooks instead of a bot user (custom name/avatar per message type)
- **Health check endpoint**: Simple HTTP server for uptime monitoring
