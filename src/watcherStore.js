const fs = require('fs');
const { join } = require('path');

const WATCHERS_PATH = join(__dirname, '..', 'watchers.json');

let watchers = [];
const watcherStates = new Map();

function loadWatchers() {
  try {
    const raw = fs.readFileSync(WATCHERS_PATH, 'utf-8');
    watchers = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      watchers = [];
    } else {
      console.error('Failed to parse watchers.json:', err.message);
      watchers = [];
    }
  }
  return watchers;
}

function saveWatchers() {
  try {
    const stat = fs.statSync(WATCHERS_PATH);
    if (stat.isDirectory()) {
      fs.rmdirSync(WATCHERS_PATH);
    }
  } catch {
    // ENOENT is fine — file doesn't exist yet
  }
  fs.writeFileSync(WATCHERS_PATH, JSON.stringify(watchers, null, 2) + '\n');
}

function addWatcher(id, discordChannelId, label) {
  const existing = watchers.find((w) => w.id === id);
  if (existing) return null;

  const watcher = {
    id,
    discordChannelId,
    label: label || '',
    addedAt: new Date().toISOString(),
  };
  watchers.push(watcher);
  saveWatchers();
  initWatcherState(id);
  return watcher;
}

function removeWatcher(id) {
  const index = watchers.findIndex((w) => w.id === id);
  if (index === -1) return false;
  watchers.splice(index, 1);
  watcherStates.delete(id);
  saveWatchers();
  return true;
}

function getWatcher(id) {
  return watchers.find((w) => w.id === id) || null;
}

function getAllWatchers() {
  return watchers;
}

function getWatcherState(id) {
  return watcherStates.get(id) || null;
}

function initWatcherState(id) {
  if (watcherStates.has(id)) return watcherStates.get(id);

  const state = {
    seenVideoIds: new Set(),
    pendingVideoIds: new Map(),
    isFirstRun: true,
    channelName: '',
    lastRssPollAt: null,
    lastRssPollOk: null,
    seenVideoCount: 0,
  };
  watcherStates.set(id, state);
  return state;
}

module.exports = {
  loadWatchers,
  saveWatchers,
  addWatcher,
  removeWatcher,
  getWatcher,
  getAllWatchers,
  getWatcherState,
  initWatcherState,
};
