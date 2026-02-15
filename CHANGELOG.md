# Changelog

## 1.2.0

### Added
- Customizable notification templates with `{title}`, `{author}`, `{url}`, `{date}` variables
- `{author}` template variable, populated from RSS feed
- Interactive template configuration in setup wizard

### Changed
- `/test_live` now works even when not live — posts notification for latest stream
- Dropped custom embeds in favor of Discord's native link preview (cleaner, more reliable)
- Live stream title fetched via YouTube oEmbed API instead of HTML scraping — fixes incorrect titles caused by localized UI labels (e.g. "Übersicht" instead of actual stream title)

### Fixed
- Live stream title showing localized YouTube UI labels instead of actual video title
- Template `\n` sequences not rendering as newlines in Discord messages
- Runtime crash when notification templates were missing from config

## 1.1.0

### Added
- `/test_video` slash command — sends a test video notification using the latest RSS entry
- `/test_live` slash command — sends a test live notification (only if channel is currently live)
- Video/live URLs appended to message content for Discord link previews
- Setup wizard now shows bot invite and channel permission steps after configuration
- View Channel listed as a required bot permission in README and setup wizard
- Docker group setup step (`usermod -aG docker`) in fresh VPS instructions

### Changed
- Refactored RSS poller and live checker to extract reusable fetch functions (`fetchLatestVideo`, `fetchLiveStatus`)

## 1.0.0

Initial release.

- YouTube RSS feed polling for new video detection
- Live stream detection via channel page scraping
- Discord embed notifications with customizable templates
- Auto-publish support for announcement channels
- `/status` slash command for bot health monitoring
- HTTP `/healthz` endpoint for Docker health checks
- Interactive setup wizard (`npm run setup`)
- Docker deployment with non-root user, read-only filesystem, and dropped capabilities
- Update script (`scripts/update.sh`) for easy redeployment
