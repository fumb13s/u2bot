const { describe, it, mock, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');

const { injectTestConfig } = require('./helpers/testConfig');
const config = injectTestConfig({ healthCheckPort: 0 });

// Require all modules BEFORE mocking fs (Node's loader uses fs.readFileSync)
const { startHealthServer } = require('../src/healthCheck');
const state = require('../src/botState');
const {
  loadWatchers,
  addWatcher,
  removeWatcher,
  getAllWatchers,
  getWatcherState,
} = require('../src/watcherStore');

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
  });
}

describe('healthCheck', () => {
  let server;
  let port;

  before(async () => {
    // Mock fs AFTER all modules are loaded
    mock.method(fs, 'readFileSync', () => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });
    mock.method(fs, 'writeFileSync', () => {});

    state.startedAt = new Date();
    loadWatchers();
    server = startHealthServer();
    await new Promise((resolve) => server.on('listening', resolve));
    port = server.address().port;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    mock.restoreAll();
  });

  beforeEach(() => {
    for (const w of getAllWatchers()) {
      removeWatcher(w.id);
    }
    loadWatchers();
  });

  describe('GET /healthz', () => {
    it('returns 200 + healthy with no watchers', async () => {
      const res = await httpGet(port, '/healthz');
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.status, 'healthy');
      assert.equal(data.watcherCount, 0);
    });

    it('returns 503 + unhealthy with stale watcher', async () => {
      addWatcher('UChealth_stale_test_123', '123', 'Stale');
      const ws = getWatcherState('UChealth_stale_test_123');
      ws.lastRssPollAt = new Date(Date.now() - 60 * 60 * 1000);
      ws.lastRssPollOk = true;

      const res = await httpGet(port, '/healthz');
      assert.equal(res.statusCode, 503);
      const data = JSON.parse(res.body);
      assert.equal(data.status, 'unhealthy');
    });

    it('returns correct JSON shape', async () => {
      addWatcher('UChealth_shape_test_123', '123', 'Shape');

      const res = await httpGet(port, '/healthz');
      const data = JSON.parse(res.body);

      assert.ok('status' in data);
      assert.ok('uptime' in data);
      assert.ok('watcherCount' in data);
      assert.ok('watchers' in data);
      assert.ok(Array.isArray(data.watchers));
      assert.equal(data.watchers.length, 1);
      assert.ok('id' in data.watchers[0]);
      assert.ok('healthy' in data.watchers[0]);
      assert.ok('rss' in data.watchers[0]);
    });

    it('returns 200 with healthy watcher', async () => {
      addWatcher('UChealth_ok_test_123456', '123', 'Healthy');
      const ws = getWatcherState('UChealth_ok_test_123456');
      ws.lastRssPollAt = new Date();
      ws.lastRssPollOk = true;

      const res = await httpGet(port, '/healthz');
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.status, 'healthy');
    });
  });

  describe('other routes', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await httpGet(port, '/unknown');
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 for root', async () => {
      const res = await httpGet(port, '/');
      assert.equal(res.statusCode, 404);
    });
  });
});
