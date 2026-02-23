// Inject a test config into the require cache before any src/ module loads config.js.
// config.js calls process.exit(1) if config.json is missing, so we bypass it entirely.

function injectTestConfig(overrides = {}) {
  const configPath = require.resolve('../../src/config');

  if (require.cache[configPath]) return require.cache[configPath].exports;

  const config = {
    discord: { token: 'test-token', autoPublish: false, ...overrides.discord },
    polling: { rssFeedIntervalMinutes: 3, ...overrides.polling },
    healthCheckPort: overrides.healthCheckPort ?? 0,
    messages: {
      video: { content: '{author} uploaded {title}\\n{url}' },
      live: { content: '{author} is live: {title}\\n{url}' },
      ...overrides.messages,
    },
  };

  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: config,
  };

  return config;
}

module.exports = { injectTestConfig };
