const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { injectTestConfig } = require('./helpers/testConfig');
const config = injectTestConfig();

const {
  handleStatusInteraction,
  handleToggleAutopublishInteraction,
  isPollerHealthy,
  formatTimestamp,
} = require('../src/statusCommand');
const state = require('../src/botState');
const { createMockInteraction } = require('./helpers/mockInteraction');

describe('isPollerHealthy', () => {
  it('returns false for null', () => {
    assert.equal(isPollerHealthy(null, 3), false);
  });

  it('returns false for stale timestamp', () => {
    const stale = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    assert.equal(isPollerHealthy(stale, 3), false);
  });

  it('returns true for recent timestamp', () => {
    const recent = new Date(); // just now
    assert.equal(isPollerHealthy(recent, 3), true);
  });
});

describe('formatTimestamp', () => {
  it('returns "never" for null', () => {
    assert.equal(formatTimestamp(null), 'never');
  });

  it('returns Discord relative timestamp format for valid date', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = formatTimestamp(date);
    const expected = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    assert.equal(result, expected);
  });
});

describe('handleStatusInteraction', () => {
  beforeEach(() => {
    state.startedAt = new Date();
    config.discord.autoPublish = false;
  });

  it('ignores non-chat-input commands', async () => {
    const interaction = createMockInteraction('status');
    interaction.isChatInputCommand = () => false;
    await handleStatusInteraction(interaction);
    assert.equal(interaction.reply.mock.callCount(), 0);
  });

  it('ignores wrong command name', async () => {
    const interaction = createMockInteraction('other');
    await handleStatusInteraction(interaction);
    assert.equal(interaction.reply.mock.callCount(), 0);
  });

  it('replies with embed containing version, uptime, watcher count, auto-publish', async () => {
    const interaction = createMockInteraction('status');
    await handleStatusInteraction(interaction);

    assert.equal(interaction.reply.mock.callCount(), 1);
    const replyArg = interaction.reply.mock.calls[0].arguments[0];
    assert.ok(replyArg.embeds);
    assert.equal(replyArg.embeds.length, 1);

    const embed = replyArg.embeds[0];
    assert.equal(embed.title, 'u2bot Status');

    const fieldNames = embed.fields.map((f) => f.name);
    assert.ok(fieldNames.includes('Version'));
    assert.ok(fieldNames.includes('Uptime'));
    assert.ok(fieldNames.includes('Watchers'));
    assert.ok(fieldNames.includes('Auto-Publish'));
  });
});

describe('handleToggleAutopublishInteraction', () => {
  beforeEach(() => {
    config.discord.autoPublish = false;
  });

  it('ignores non-chat-input commands', async () => {
    const interaction = createMockInteraction('toggle_autopublish');
    interaction.isChatInputCommand = () => false;
    await handleToggleAutopublishInteraction(interaction);
    assert.equal(interaction.reply.mock.callCount(), 0);
  });

  it('toggles autoPublish and replies with new state', async () => {
    const interaction = createMockInteraction('toggle_autopublish');
    await handleToggleAutopublishInteraction(interaction);
    assert.equal(config.discord.autoPublish, true);
    assert.equal(interaction.reply.mock.callCount(), 1);
    assert.ok(interaction.reply.mock.calls[0].arguments[0].content.includes('On'));

    const interaction2 = createMockInteraction('toggle_autopublish');
    await handleToggleAutopublishInteraction(interaction2);
    assert.equal(config.discord.autoPublish, false);
    assert.ok(interaction2.reply.mock.calls[0].arguments[0].content.includes('Off'));
  });
});
