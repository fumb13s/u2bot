const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { injectTestConfig } = require('./helpers/testConfig');
injectTestConfig();

const { handleTestInteraction, resolveWatcher } = require('../src/testCommands');
const {
  loadWatchers,
  addWatcher,
  removeWatcher,
  getAllWatchers,
} = require('../src/watcherStore');
const { createMockInteraction } = require('./helpers/mockInteraction');

describe('testCommands', () => {
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

  describe('resolveWatcher', () => {
    it('returns single watcher when only one exists', () => {
      addWatcher('UCsingle_resolve_test_1', '123', 'Only');
      const interaction = createMockInteraction('test_video');
      const result = resolveWatcher(interaction);
      assert.ok(result.watcher);
      assert.equal(result.watcher.id, 'UCsingle_resolve_test_1');
      assert.equal(result.error, undefined);
    });

    it('returns error for no watchers', () => {
      const interaction = createMockInteraction('test_video');
      const result = resolveWatcher(interaction);
      assert.ok(result.error);
      assert.ok(result.error.includes('No watchers'));
    });

    it('returns error with IDs for multiple watchers', () => {
      addWatcher('UCmulti_resolve_test_01', '123', 'A');
      addWatcher('UCmulti_resolve_test_02', '456', 'B');
      const interaction = createMockInteraction('test_video');
      const result = resolveWatcher(interaction);
      assert.ok(result.error);
      assert.ok(result.error.includes('Multiple'));
      assert.ok(result.error.includes('UCmulti_resolve_test_01'));
      assert.ok(result.error.includes('UCmulti_resolve_test_02'));
    });

    it('finds watcher by explicit channel_id', () => {
      addWatcher('UCexplicit_resolve_test', '123', 'Explicit');
      addWatcher('UCother_resolve_test_01', '456', 'Other');
      const interaction = createMockInteraction('test_video', {
        channel_id: 'UCexplicit_resolve_test',
      });
      const result = resolveWatcher(interaction);
      assert.ok(result.watcher);
      assert.equal(result.watcher.id, 'UCexplicit_resolve_test');
    });

    it('returns error for unknown channel_id', () => {
      addWatcher('UCknown_resolve_test_01', '123', 'Known');
      const interaction = createMockInteraction('test_video', {
        channel_id: 'UCunknown_resolve_test_',
      });
      const result = resolveWatcher(interaction);
      assert.ok(result.error);
      assert.ok(result.error.includes('No watcher found'));
    });
  });

  describe('handleTestInteraction', () => {
    it('ignores non-chat-input commands', async () => {
      const interaction = createMockInteraction('test_video');
      interaction.isChatInputCommand = () => false;
      await handleTestInteraction(interaction);
      assert.equal(interaction.deferReply.mock.callCount(), 0);
    });

    it('ignores wrong command name', async () => {
      const interaction = createMockInteraction('other_command');
      await handleTestInteraction(interaction);
      assert.equal(interaction.deferReply.mock.callCount(), 0);
    });
  });
});
