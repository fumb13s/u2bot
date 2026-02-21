const http = require('http');
const config = require('./config');
const state = require('./botState');
const { getAllWatchers, getWatcherState } = require('./watcherStore');

function isPollerHealthy(lastPollAt, intervalMinutes) {
  if (!lastPollAt) return false;
  const maxAge = intervalMinutes * 2 * 60 * 1000;
  return Date.now() - lastPollAt.getTime() < maxAge;
}

function startHealthServer() {
  const port = config.healthCheckPort || 3000;

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const watchers = getAllWatchers();
      const watcherDetails = watchers.map((w) => {
        const ws = getWatcherState(w.id);
        const rssHealthy = ws ? isPollerHealthy(ws.lastRssPollAt, config.polling.rssFeedIntervalMinutes) : false;
        const liveHealthy = ws ? isPollerHealthy(ws.lastLiveCheckAt, config.polling.liveCheckIntervalMinutes) : false;
        return {
          id: w.id,
          label: ws?.channelName || w.label || w.id,
          healthy: rssHealthy && liveHealthy,
          rss: {
            lastPollAt: ws?.lastRssPollAt,
            ok: ws?.lastRssPollOk,
            healthy: rssHealthy,
          },
          live: {
            lastPollAt: ws?.lastLiveCheckAt,
            ok: ws?.lastLiveCheckOk,
            healthy: liveHealthy,
          },
        };
      });

      const healthy = watchers.length === 0 || watcherDetails.every((w) => w.healthy);

      const body = JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        uptime: state.startedAt ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000) : 0,
        watcherCount: watchers.length,
        watchers: watcherDetails,
      });

      res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}.`);
  });

  return server;
}

module.exports = { startHealthServer };
