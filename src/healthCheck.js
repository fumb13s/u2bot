const http = require('http');
const config = require('./config');
const state = require('./botState');

function isPollerHealthy(lastPollAt, intervalMinutes) {
  if (!lastPollAt) return false;
  const maxAge = intervalMinutes * 2 * 60 * 1000;
  return Date.now() - lastPollAt.getTime() < maxAge;
}

function startHealthServer() {
  const port = config.healthCheckPort || 3000;

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const rssHealthy = isPollerHealthy(state.lastRssPollAt, config.polling.rssFeedIntervalMinutes);
      const liveHealthy = isPollerHealthy(state.lastLiveCheckAt, config.polling.liveCheckIntervalMinutes);
      const healthy = rssHealthy && liveHealthy;

      const body = JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        uptime: state.startedAt ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000) : 0,
        rss: {
          lastPollAt: state.lastRssPollAt,
          ok: state.lastRssPollOk,
          healthy: rssHealthy,
        },
        live: {
          lastPollAt: state.lastLiveCheckAt,
          ok: state.lastLiveCheckOk,
          healthy: liveHealthy,
        },
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
