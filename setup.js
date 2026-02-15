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

  // 3. Load example config as template
  const config = JSON.parse(fs.readFileSync(EXAMPLE_PATH, "utf8"));

  const rl = createInterface();

  // 4. Check for existing config.json
  if (fs.existsSync(CONFIG_PATH)) {
    const answer = await ask(
      rl,
      "config.json already exists. Overwrite? (y/N): "
    );
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Setup cancelled — existing config.json kept.");
      rl.close();
      return;
    }
    console.log();
  }

  // ── Required values ──────────────────────────────────────────────────────

  header("Discord Bot Token (required)");
  console.log(`
  1. Go to https://discord.com/developers/applications
  2. Create a new application (or select an existing one)
  3. Go to Bot → click "Reset Token" → copy the token
`);
  let token = "";
  while (!token) {
    token = (await askMasked(rl, "  Bot token: ")).trim();
    if (!token) console.log("  Token cannot be empty.");
  }
  config.discord.token = token;

  header("YouTube Channel ID (required)");
  console.log(`
  The channel ID starts with "UC" and is 24 characters long.
  Find it at: https://www.youtube.com/account_advanced
  Or from the channel URL: youtube.com/channel/UC...
`);
  let ytChannel = "";
  while (!ytChannel) {
    ytChannel = (await ask(rl, "  YouTube channel ID: ")).trim();
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
  let videoChannelId = "";
  while (!videoChannelId) {
    videoChannelId = (await ask(rl, "  Video channel ID: ")).trim();
    if (!videoChannelId) console.log("  Channel ID cannot be empty.");
  }
  config.discord.videoChannelId = videoChannelId;

  header("Discord Live Channel ID (required)");
  console.log(`
  This is the Discord channel where live-stream notifications are posted.
`);
  const liveAnswer = await ask(
    rl,
    `  Use the same channel as videos (${videoChannelId})? (Y/n): `
  );
  if (liveAnswer.trim().toLowerCase() === "n") {
    let liveChannelId = "";
    while (!liveChannelId) {
      liveChannelId = (await ask(rl, "  Live channel ID: ")).trim();
      if (!liveChannelId) console.log("  Channel ID cannot be empty.");
    }
    config.discord.liveChannelId = liveChannelId;
  } else {
    config.discord.liveChannelId = videoChannelId;
  }

  // ── Optional values ──────────────────────────────────────────────────────

  header("Optional Settings (press Enter for defaults)");

  const autoPublishAnswer = await ask(
    rl,
    "  Auto-publish messages in announcement channels? (Y/n): "
  );
  config.discord.autoPublish =
    autoPublishAnswer.trim().toLowerCase() !== "n";

  const rssAnswer = await ask(
    rl,
    "  RSS feed poll interval in minutes (default: 3): "
  );
  const rssInterval = parseInt(rssAnswer.trim(), 10);
  if (rssInterval > 0) config.polling.rssFeedIntervalMinutes = rssInterval;

  const liveCheckAnswer = await ask(
    rl,
    "  Live-stream check interval in minutes (default: 2): "
  );
  const liveInterval = parseInt(liveCheckAnswer.trim(), 10);
  if (liveInterval > 0) config.polling.liveCheckIntervalMinutes = liveInterval;

  // ── Write config ─────────────────────────────────────────────────────────

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nconfig.json written successfully.`);

  // ── Next steps ───────────────────────────────────────────────────────────

  header("Next Steps");
  console.log(`
  Start the bot:

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
