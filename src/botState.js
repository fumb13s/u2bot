const state = {
  startedAt: null,
  lastRssPollAt: null,
  lastRssPollOk: null,
  lastLiveCheckAt: null,
  lastLiveCheckOk: null,
  isCurrentlyLive: false,
  seenVideoCount: 0,
  channelName: '',
  liveVideoIds: new Set(),
};

module.exports = state;
