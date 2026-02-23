const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  loadWatchers,
  addWatcher,
  removeWatcher,
  getWatcher,
  getAllWatchers,
  initWatcherState,
  getWatcherState,
} = require('../src/watcherStore');

describe('watcherStore', () => {
  beforeEach(() => {
    // Remove any existing watchers to reset state
    for (const w of getAllWatchers()) {
      removeWatcher(w.id);
    }
    // Mock fs to suppress file I/O
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

  describe('loadWatchers', () => {
    it('parses JSON from file', () => {
      fs.readFileSync.mock.mockImplementation(() =>
        JSON.stringify([{ id: 'UC123', discordChannelId: '456', label: 'Test' }]),
      );
      const result = loadWatchers();
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'UC123');
    });

    it('handles ENOENT by returning empty array', () => {
      const result = loadWatchers();
      assert.deepEqual(result, []);
    });

    it('handles parse errors by returning empty array', () => {
      fs.readFileSync.mock.mockImplementation(() => 'not valid json{{{');
      const result = loadWatchers();
      assert.deepEqual(result, []);
    });
  });

  describe('initWatcherState', () => {
    it('creates state with correct defaults', () => {
      const state = initWatcherState('UC_test_init');
      assert.ok(state.seenVideoIds instanceof Set);
      assert.equal(state.isFirstRun, true);
      assert.equal(state.channelName, '');
      assert.equal(state.lastRssPollAt, null);
      assert.equal(state.lastRssPollOk, null);
      assert.equal(state.seenVideoCount, 0);
    });

    it('returns existing state if already initialized', () => {
      const state1 = initWatcherState('UC_test_existing');
      state1.channelName = 'modified';
      const state2 = initWatcherState('UC_test_existing');
      assert.equal(state2.channelName, 'modified');
      assert.strictEqual(state1, state2);
    });
  });

  describe('addWatcher', () => {
    it('adds new watcher and returns it', () => {
      const watcher = addWatcher('UCadd1234567890123456_', '123', 'Test');
      assert.ok(watcher);
      assert.equal(watcher.id, 'UCadd1234567890123456_');
      assert.equal(watcher.discordChannelId, '123');
      assert.equal(watcher.label, 'Test');
      assert.ok(watcher.addedAt);
    });

    it('returns null for duplicate ID', () => {
      addWatcher('UCdup1234567890123456_', '123', 'First');
      const dup = addWatcher('UCdup1234567890123456_', '456', 'Second');
      assert.equal(dup, null);
    });

    it('initializes watcher state', () => {
      addWatcher('UCstate23456789012345_', '123', 'WithState');
      const state = getWatcherState('UCstate23456789012345_');
      assert.ok(state);
      assert.equal(state.isFirstRun, true);
    });

    it('calls saveWatchers (writes to fs)', () => {
      addWatcher('UCsave1234567890123456', '123', 'Save');
      assert.ok(fs.writeFileSync.mock.callCount() > 0);
    });
  });

  describe('removeWatcher', () => {
    it('removes existing watcher', () => {
      addWatcher('UCrem1234567890123456_', '123', 'ToRemove');
      const result = removeWatcher('UCrem1234567890123456_');
      assert.equal(result, true);
      assert.equal(getWatcher('UCrem1234567890123456_'), null);
    });

    it('returns false for non-existent', () => {
      const result = removeWatcher('UCnonexistent1234567890');
      assert.equal(result, false);
    });

    it('clears watcher state', () => {
      addWatcher('UCclr1234567890123456_', '123', 'ToClear');
      assert.ok(getWatcherState('UCclr1234567890123456_'));
      removeWatcher('UCclr1234567890123456_');
      assert.equal(getWatcherState('UCclr1234567890123456_'), null);
    });
  });

  describe('getWatcher', () => {
    it('finds by ID', () => {
      addWatcher('UCget1234567890123456_', '123', 'FindMe');
      const watcher = getWatcher('UCget1234567890123456_');
      assert.ok(watcher);
      assert.equal(watcher.label, 'FindMe');
    });

    it('returns null for missing', () => {
      assert.equal(getWatcher('UCmissing'), null);
    });
  });

  describe('getAllWatchers', () => {
    it('returns array of all watchers', () => {
      addWatcher('UCalla234567890123456_', '1', 'A');
      addWatcher('UCallb234567890123456_', '2', 'B');
      const all = getAllWatchers();
      assert.equal(all.length, 2);
    });
  });
});
