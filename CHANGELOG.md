# Changelog

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
