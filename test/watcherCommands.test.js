const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { injectTestConfig } = require('./helpers/testConfig');
const config = injectTestConfig();

const { handleWatcherInteraction } = require('../src/watcherCommands');
const {
  loadWatchers,
  addWatcher,
  removeWatcher,
  getAllWatchers,
  initWatcherState,
  getWatcherState,
} = require('../src/watcherStore');
const { createMockInteraction, createMockChannel } = require('./helpers/mockInteraction');

describe('watcherCommands', () => {
  beforeEach(() => {
    for (const w of getAllWatchers()) {
      removeWatcher(w.id);
    }
    mock.method(fs, 'readFileSync', () => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });
    mock.method(fs, 'writeFileSync', () => {});
    loadWatchers();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('handleWatch', () => {
    it('validates YouTube channel ID format', async () => {
      const mockChannel = createMockChannel('discord-ch-1');
      const interaction = createMockInteraction('watch', {
        channel_id: 'invalid-id',
        discord_channel: mockChannel,
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('Invalid'));
    });

    it('rejects duplicates', async () => {
      const channelId = 'UCdup_watch_test_1234567';
      addWatcher(channelId, '123', 'Existing');

      const mockChannel = createMockChannel('discord-ch-2');
      const interaction = createMockInteraction('watch', {
        channel_id: channelId,
        discord_channel: mockChannel,
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('already exists'));
    });

    it('checks bot permissions', async () => {
      const mockChannel = createMockChannel('discord-ch-3');
      mockChannel.permissionsFor = mock.fn(() => ({
        has: mock.fn(() => false),
      }));

      const interaction = createMockInteraction('watch', {
        channel_id: 'UCperm_check_test_234567',
        discord_channel: mockChannel,
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('permission'));
    });

    it('adds watcher on success', async () => {
      const channelId = 'UCsuccess_watch_test_12x';
      const mockChannel = createMockChannel('discord-ch-4');

      const interaction = createMockInteraction('watch', {
        channel_id: channelId,
        discord_channel: mockChannel,
        label: 'My Channel',
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('Watcher added'));

      const all = getAllWatchers();
      assert.ok(all.some((w) => w.id === channelId));
    });
  });

  describe('handleUnwatch', () => {
    it('removes existing watcher', async () => {
      const channelId = 'UCunwatch_existing_test_';
      addWatcher(channelId, '123', 'ToRemove');

      const interaction = createMockInteraction('unwatch', {
        channel_id: channelId,
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('removed'));
      assert.ok(!getAllWatchers().some((w) => w.id === channelId));
    });

    it('replies with error for non-existent', async () => {
      const interaction = createMockInteraction('unwatch', {
        channel_id: 'UCnonexistent_1234567890',
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('No watcher found'));
    });
  });

  describe('handleWatchers', () => {
    it('shows "no watchers" message when empty', async () => {
      const interaction = createMockInteraction('watchers');
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('No watchers'));
    });

    it('lists watchers with health status', async () => {
      addWatcher('UClist_watchers_test_123', '123', 'Channel A');
      const state = getWatcherState('UClist_watchers_test_123');
      state.lastRssPollAt = new Date();
      state.lastRssPollOk = true;
      state.channelName = 'Channel A';

      const interaction = createMockInteraction('watchers');
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const replyArg = interaction.reply.mock.calls[0].arguments[0];
      assert.ok(replyArg.embeds);
      assert.ok(replyArg.embeds[0].description.includes('Channel A'));
    });
  });

  describe('handleWatcher', () => {
    it('shows detail embed', async () => {
      const channelId = 'UCdetail_watcher_test_1';
      addWatcher(channelId, '123', 'Detail Test');
      const state = getWatcherState(channelId);
      state.channelName = 'Detail Channel';
      state.lastRssPollAt = new Date();
      state.lastRssPollOk = true;

      const interaction = createMockInteraction('watcher', {
        channel_id: channelId,
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const embed = interaction.reply.mock.calls[0].arguments[0].embeds[0];
      assert.ok(embed.title.includes('Detail Channel'));
      assert.ok(embed.fields.some((f) => f.name === 'YouTube Channel ID'));
      assert.ok(embed.fields.some((f) => f.name === 'Discord Channel'));
      assert.ok(embed.fields.some((f) => f.name === 'RSS Poller'));
    });

    it('handles non-existent watcher', async () => {
      const interaction = createMockInteraction('watcher', {
        channel_id: 'UCmissing_detail_test_12',
      });
      await handleWatcherInteraction(interaction);

      assert.equal(interaction.reply.mock.callCount(), 1);
      const content = interaction.reply.mock.calls[0].arguments[0].content;
      assert.ok(content.includes('No watcher found'));
    });
  });
});
