#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_PATH = path.join(__dirname, "config.example.json");

// ── Helpers ──────────────────────────────────────────────────────────────────

function createInterface() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Exit cleanly on Ctrl+C
  rl.on("close", () => {
    console.log("\nSetup cancelled.");
    process.exit(0);
  });

  return rl;
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Prompt for a value, masking input with asterisks (for tokens/secrets).
 */
function askMasked(rl, question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let value = "";

    const onData = (buf) => {
      const ch = buf.toString("utf8");

      for (const c of ch) {
        const code = c.charCodeAt(0);

        if (c === "\r" || c === "\n") {
          // Enter — done
          stdin.removeListener("data", onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          process.stdout.write("\n");
          resolve(value);
          return;
        }

        if (code === 3) {
          // Ctrl+C
          stdin.removeListener("data", onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          process.stdout.write("\n");
          rl.close(); // triggers the "close" handler above
          return;
        }

        if (code === 127 || code === 8) {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (code >= 32) {
          // Printable character
          value += c;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

function header(text) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function isRealValue(val) {
  return typeof val === "string" && val.length > 0 && !val.includes("YOUR_") && !val.includes("_HERE");
}

function defaultHint(val) {
  return isRealValue(val) ? ` [${val}]` : "";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("u2bot — Interactive Setup\n");

  // 1. Check Node.js version
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
    console.error(
      `Error: Node.js >= 18 is required (you have ${process.versions.node}).`
    );
    console.error("Please upgrade Node.js and try again.");
    process.exit(1);
  }

  // 2. Run npm install if node_modules doesn't exist
  if (!fs.existsSync(path.join(__dirname, "node_modules"))) {
    console.log("Installing dependencies (npm install)...\n");
    execSync("npm install", { cwd: __dirname, stdio: "inherit" });
    console.log();
  }

  // 3. Load existing config if present, otherwise use example as template
  let existing = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      // ignore parse errors — fall back to example
    }
  }
  const config = existing
    ? JSON.parse(JSON.stringify(existing))
    : JSON.parse(fs.readFileSync(EXAMPLE_PATH, "utf8"));

  const rl = createInterface();

  if (existing) {
    console.log(
      "Existing config.json found — current values shown as defaults.\n" +
        "Press Enter to keep a value, or type a new one to replace it."
    );
  }

  // ── Required values ──────────────────────────────────────────────────────

  header("Discord Bot Token (required)");
  console.log(`
  1. Go to https://discord.com/developers/applications
  2. Create a new application (or select an existing one)
  3. Go to Bot → click "Reset Token" → copy the token
`);
  const hasToken = isRealValue(existing?.discord?.token);
  const tokenHint = hasToken ? " [Enter to keep existing]" : "";
  let token = "";
  while (!token) {
    token = (await askMasked(rl, `  Bot token${tokenHint}: `)).trim();
    if (!token && hasToken) {
      token = existing.discord.token;
    }
    if (!token) console.log("  Token cannot be empty.");
  }
  config.discord.token = token;

  header("YouTube Channel ID (required)");
  console.log(`
  The channel ID starts with "UC" and is 24 characters long.
  Find it at: https://www.youtube.com/account_advanced
  Or from the channel URL: youtube.com/channel/UC...
`);
  const ytDefault = existing?.youtube?.channelId;
  let ytChannel = "";
  while (!ytChannel) {
    ytChannel = (await ask(rl, `  YouTube channel ID${defaultHint(ytDefault)}: `)).trim();
    if (!ytChannel && isRealValue(ytDefault)) ytChannel = ytDefault;
    if (!ytChannel) console.log("  Channel ID cannot be empty.");
  }
  config.youtube.channelId = ytChannel;

  header("Discord Video Channel ID (required)");
  console.log(`
  This is the Discord channel where new-video notifications are posted.

  To get a channel ID:
  1. Open Discord Settings → Advanced → enable Developer Mode
  2. Right-click the target channel → "Copy Channel ID"
`);
  const videoDefault = existing?.discord?.videoChannelId;
  let videoChannelId = "";
  while (!videoChannelId) {
    videoChannelId = (await ask(rl, `  Video channel ID${defaultHint(videoDefault)}: `)).trim();
    if (!videoChannelId && isRealValue(videoDefault)) videoChannelId = videoDefault;
    if (!videoChannelId) console.log("  Channel ID cannot be empty.");
  }
  config.discord.videoChannelId = videoChannelId;

  header("Discord Live Channel ID (required)");
  console.log(`
  This is the Discord channel where live-stream notifications are posted.
`);
  const liveDefault = existing?.discord?.liveChannelId;
  const liveIsSameAsVideo = !isRealValue(liveDefault) || liveDefault === videoChannelId;
  const liveAnswer = await ask(
    rl,
    `  Use the same channel as videos (${videoChannelId})? (${liveIsSameAsVideo ? "Y/n" : "y/N"}): `
  );
  const useSame = liveIsSameAsVideo
    ? liveAnswer.trim().toLowerCase() !== "n"
    : liveAnswer.trim().toLowerCase() === "y";
  if (useSame) {
    config.discord.liveChannelId = videoChannelId;
  } else {
    let liveChannelId = "";
    while (!liveChannelId) {
      liveChannelId = (await ask(rl, `  Live channel ID${defaultHint(liveDefault)}: `)).trim();
      if (!liveChannelId && isRealValue(liveDefault)) liveChannelId = liveDefault;
      if (!liveChannelId) console.log("  Channel ID cannot be empty.");
    }
    config.discord.liveChannelId = liveChannelId;
  }

  // ── Optional values ──────────────────────────────────────────────────────

  header("Optional Settings (press Enter for defaults)");

  const currentAutoPublish = existing?.discord?.autoPublish ?? true;
  const autoPublishAnswer = await ask(
    rl,
    `  Auto-publish messages in announcement channels? (${currentAutoPublish ? "Y/n" : "y/N"}): `
  );
  if (autoPublishAnswer.trim() === "") {
    config.discord.autoPublish = currentAutoPublish;
  } else {
    config.discord.autoPublish =
      autoPublishAnswer.trim().toLowerCase() !== "n";
  }

  const currentRss = existing?.polling?.rssFeedIntervalMinutes ?? 3;
  const rssAnswer = await ask(
    rl,
    `  RSS feed poll interval in minutes (default: ${currentRss}): `
  );
  const rssInterval = parseInt(rssAnswer.trim(), 10);
  config.polling.rssFeedIntervalMinutes = rssInterval > 0 ? rssInterval : currentRss;

  const currentLive = existing?.polling?.liveCheckIntervalMinutes ?? 2;
  const liveCheckAnswer = await ask(
    rl,
    `  Live-stream check interval in minutes (default: ${currentLive}): `
  );
  const liveInterval = parseInt(liveCheckAnswer.trim(), 10);
  config.polling.liveCheckIntervalMinutes = liveInterval > 0 ? liveInterval : currentLive;

  header("Notification Templates (press Enter for defaults)");
  console.log(`
  Placeholders: {author}, {title}, {url}, {date}
  Include {url} on its own line so Discord generates a link preview.
  Use \\n for line breaks.
`);

  const defaultVideoContent = "🎬 **{author}** just uploaded a new video!\n**{title}**\n{url}";
  const currentVideoContent = (existing?.messages?.video?.content ?? defaultVideoContent).replace(/\\n/g, "\n");
  const videoContentDisplay = currentVideoContent.replace(/\n/g, "\\n");
  const videoContentAnswer = (await ask(rl, `  Video template [${videoContentDisplay}]: `)).trim();
  config.messages = config.messages ?? {};
  config.messages.video = config.messages.video ?? {};
  config.messages.video.content = videoContentAnswer
    ? videoContentAnswer.replace(/\\n/g, "\n")
    : currentVideoContent;

  const defaultLiveContent = "🔴 **{author}** is live right now!\n**{title}**\n{url}";
  const currentLiveContent = (existing?.messages?.live?.content ?? defaultLiveContent).replace(/\\n/g, "\n");
  const liveContentDisplay = currentLiveContent.replace(/\n/g, "\\n");
  const liveContentAnswer = (await ask(rl, `  Live template [${liveContentDisplay}]: `)).trim();
  config.messages.live = config.messages.live ?? {};
  config.messages.live.content = liveContentAnswer
    ? liveContentAnswer.replace(/\\n/g, "\n")
    : currentLiveContent;

  // ── Write config ─────────────────────────────────────────────────────────

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nconfig.json written successfully.`);

  // ── Next steps ───────────────────────────────────────────────────────────

  header("Next Steps");
  console.log(`
  1. Invite the bot to your server (if you haven't already):

     Go to https://discord.com/developers/applications
     → your app → OAuth2 → URL Generator
     Select scopes: bot, applications.commands
     Select permissions: Send Messages, Embed Links
     Open the generated URL in your browser to add the bot.

  2. Make sure the bot has access to the notification channels:

     The bot needs "View Channel", "Send Messages", and "Embed Links"
     permissions in each channel it posts to. If using announcement
     channels with auto-publish, it also needs "Manage Messages".

  3. Start the bot:

     npm start

  The bot will begin polling the YouTube RSS feed and
  post notifications to your Discord channel(s). Enjoy!
`);

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
