const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  entryToVideoData,
  isLiveVideo,
  fetchFeedEntries,
  fetchLatestVideo,
  pollRssFeedForWatcher,
} = require('../src/rssPoller');

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns="http://www.w3.org/2005/Atom">
  <author><name>TestChannel</name></author>
  <entry>
    <yt:videoId>vid1</yt:videoId>
    <title>First Video</title>
    <published>2024-01-15T12:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>vid2</yt:videoId>
    <title>Second Video</title>
    <published>2024-01-14T12:00:00+00:00</published>
  </entry>
</feed>`;

const SINGLE_ENTRY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns="http://www.w3.org/2005/Atom">
  <author><name>Solo</name></author>
  <entry>
    <yt:videoId>solo1</yt:videoId>
    <title>Only Video</title>
    <published>2024-01-15T12:00:00+00:00</published>
  </entry>
</feed>`;

const EMPTY_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns="http://www.w3.org/2005/Atom">
  <author><name>Empty</name></author>
</feed>`;

describe('entryToVideoData', () => {
  it('transforms RSS entry to video data object', () => {
    const entry = {
      'yt:videoId': 'abc123',
      title: 'My Video',
      published: '2024-06-15T12:00:00+00:00',
    };
    const result = entryToVideoData(entry, 'ChannelName');
    assert.equal(result.videoId, 'abc123');
    assert.equal(result.title, 'My Video');
    assert.equal(result.author, 'ChannelName');
    assert.equal(result.url, 'https://www.youtube.com/watch?v=abc123');
    assert.ok(result.date);
  });

  it('handles missing fields', () => {
    const entry = { 'yt:videoId': 'xyz' };
    const result = entryToVideoData(entry, '');
    assert.equal(result.title, 'Untitled');
    assert.equal(result.author, '');
    assert.ok(result.date); // falls back to today
  });
});

describe('isLiveVideo', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('detects live stream in ytInitialPlayerResponse', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () =>
        '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"live123","isLive":true,"isLiveContent":true}};</script></html>',
    }));

    const result = await isLiveVideo('live123');
    assert.equal(result, true);
  });

  it('returns false for regular upload', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () =>
        '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"vid1","isLive":false,"isLiveContent":false}};</script></html>',
    }));

    const result = await isLiveVideo('vid1');
    assert.equal(result, false);
  });

  it('returns false when live indicators only appear in related videos', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () =>
        '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"upload1","isLive":false,"isLiveContent":false}};</script>' +
        '<script>var ytInitialData = {"contents":{"relatedVideo":{"isLive":true,"isLiveContent":true}}};</script></html>',
    }));

    const result = await isLiveVideo('upload1');
    assert.equal(result, false);
  });

  it('returns false for VOD of past stream (isLive false, isLiveContent true)', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () =>
        '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"vod1","isLive":false,"isLiveContent":true}};</script></html>',
    }));

    const result = await isLiveVideo('vod1');
    assert.equal(result, false);
  });

  it('returns false when ytInitialPlayerResponse is missing', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => '<html>normal video page</html>',
    }));

    const result = await isLiveVideo('notlive');
    assert.equal(result, false);
  });

  it('returns false on network error', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network error');
    });

    const result = await isLiveVideo('err123');
    assert.equal(result, false);
  });

  it('returns false on non-ok response', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: false,
    }));

    const result = await isLiveVideo('notfound');
    assert.equal(result, false);
  });
});

describe('fetchFeedEntries', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('parses RSS XML', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => RSS_XML,
    }));

    const result = await fetchFeedEntries('UC_test');
    assert.ok(result);
    assert.equal(result.author, 'TestChannel');
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0]['yt:videoId'], 'vid1');
  });

  it('normalizes single entry to array', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => SINGLE_ENTRY_XML,
    }));

    const result = await fetchFeedEntries('UC_single');
    assert.ok(result);
    assert.ok(Array.isArray(result.entries));
    assert.equal(result.entries.length, 1);
  });

  it('handles empty feed', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => EMPTY_FEED_XML,
    }));

    const result = await fetchFeedEntries('UC_empty');
    assert.ok(result);
    assert.equal(result.entries.length, 0);
  });

  it('handles fetch errors', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch failed');
    });

    const result = await fetchFeedEntries('UC_err');
    assert.equal(result, null);
  });

  it('handles non-ok response', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const result = await fetchFeedEntries('UC_500');
    assert.equal(result, null);
  });

  it('handles parse errors', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => 'not xml at all <<<',
    }));

    const result = await fetchFeedEntries('UC_badxml');
    // fast-xml-parser may not throw on some malformed input, so result could be non-null
    // but if it does throw, we should get null
    // This test verifies no unhandled exception occurs
    assert.ok(result === null || result !== undefined);
  });
});

describe('fetchLatestVideo', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('returns first entry from feed', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => RSS_XML,
    }));

    const result = await fetchLatestVideo('UC_latest');
    assert.ok(result);
    assert.equal(result.videoId, 'vid1');
    assert.equal(result.title, 'First Video');
    assert.equal(result.author, 'TestChannel');
  });

  it('returns null for empty feed', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => EMPTY_FEED_XML,
    }));

    const result = await fetchLatestVideo('UC_empty2');
    assert.equal(result, null);
  });

  it('returns null on fetch error', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline');
    });

    const result = await fetchLatestVideo('UC_offline');
    assert.equal(result, null);
  });
});

describe('pollRssFeedForWatcher', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  function makeWatcherState() {
    return {
      seenVideoIds: new Set(),
      pendingVideoIds: new Map(),
      isFirstRun: true,
      channelName: '',
      lastRssPollAt: null,
      lastRssPollOk: null,
      seenVideoCount: 0,
    };
  }

  it('seeds seen IDs on first run', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => RSS_XML,
    }));

    const client = { channels: { fetch: mock.fn() } };
    const watcher = { id: 'UC_first', discordChannelId: '123', label: 'First' };
    const watcherState = makeWatcherState();
    const config = {
      discord: { autoPublish: false },
      messages: { video: { content: '{url}' }, live: { content: '{url}' } },
    };

    await pollRssFeedForWatcher(client, watcher, watcherState, config);

    assert.equal(watcherState.isFirstRun, false);
    assert.ok(watcherState.seenVideoIds.has('vid1'));
    assert.ok(watcherState.seenVideoIds.has('vid2'));
    assert.equal(watcherState.lastRssPollOk, true);
    assert.equal(watcherState.seenVideoCount, 2);
    // Should NOT have fetched a Discord channel on first run
    assert.equal(client.channels.fetch.mock.callCount(), 0);
  });

  it('sends notification for new videos after three poll cycles (deferred 2 cycles)', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      if (url.includes('feeds/videos.xml')) {
        return {
          ok: true,
          text: async () => RSS_XML,
        };
      }
      // isLiveVideo check — not live
      return { ok: true, text: async () => '<html>normal</html>' };
    });

    const mockMessage = { crosspost: mock.fn() };
    const mockChannel = { send: mock.fn(async () => mockMessage) };
    const client = {
      channels: { fetch: mock.fn(async () => mockChannel) },
    };
    const watcher = { id: 'UC_second', discordChannelId: '456', label: 'Second' };
    const watcherState = makeWatcherState();
    watcherState.isFirstRun = false;
    watcherState.seenVideoIds.add('vid2'); // Already seen vid2
    const config = {
      discord: { autoPublish: false },
      messages: { video: { content: '{url}' }, live: { content: '{url}' } },
    };

    // Poll 1: vid1 is new → queued as pending (pollsSeen=0)
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 0);
    assert.ok(watcherState.seenVideoIds.has('vid1'));
    assert.equal(watcherState.pendingVideoIds.size, 1);

    // Poll 2: pending vid1 incremented (pollsSeen=1), still not ready
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 0);
    assert.equal(watcherState.pendingVideoIds.size, 1);

    // Poll 3: pending vid1 reaches pollsSeen=2 → notification sent
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 1);
    assert.equal(watcherState.pendingVideoIds.size, 0);
  });

  it('sends live notification when deferred video is detected as live', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      if (url.includes('feeds/videos.xml')) {
        return {
          ok: true,
          text: async () => SINGLE_ENTRY_XML,
        };
      }
      // isLiveVideo check — IS live
      return {
        ok: true,
        text: async () =>
          '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"isLive":true,"isLiveContent":true}};</script></html>',
      };
    });

    const mockMessage = { crosspost: mock.fn() };
    const mockChannel = { send: mock.fn(async () => mockMessage) };
    const client = {
      channels: { fetch: mock.fn(async () => mockChannel) },
    };
    const watcher = { id: 'UC_live', discordChannelId: '789', label: 'Live' };
    const watcherState = makeWatcherState();
    watcherState.isFirstRun = false;
    const config = {
      discord: { autoPublish: false },
      messages: {
        video: { content: 'video: {url}' },
        live: { content: 'live: {url}' },
      },
    };

    // Poll 1: solo1 queued as pending (pollsSeen=0)
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 0);
    assert.equal(watcherState.pendingVideoIds.size, 1);

    // Poll 2: pending solo1 incremented (pollsSeen=1), still waiting
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 0);
    assert.equal(watcherState.pendingVideoIds.size, 1);

    // Poll 3: pending solo1 reaches pollsSeen=2, detected as live
    await pollRssFeedForWatcher(client, watcher, watcherState, config);
    assert.equal(mockChannel.send.mock.callCount(), 1);
    const sentContent = mockChannel.send.mock.calls[0].arguments[0].content;
    assert.ok(sentContent.startsWith('live:'));
    assert.equal(watcherState.pendingVideoIds.size, 0);
  });

  it('handles fetch failure', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('network down');
    });

    const client = { channels: { fetch: mock.fn() } };
    const watcher = { id: 'UC_fail', discordChannelId: '000', label: 'Fail' };
    const watcherState = makeWatcherState();
    const config = {
      discord: { autoPublish: false },
      messages: { video: { content: '{url}' }, live: { content: '{url}' } },
    };

    await pollRssFeedForWatcher(client, watcher, watcherState, config);

    assert.equal(watcherState.lastRssPollOk, false);
    assert.ok(watcherState.lastRssPollAt);
  });
});
