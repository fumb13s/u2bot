const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchFeedEntries,
  entryToVideoData,
  fetchLatestVideo,
  isLiveVideo,
} = require('../../src/rssPoller');

// YouTube's own channel — the most stable public channel on the platform.
const TEST_CHANNEL_ID = 'UCBR8-60-B28hp2BmDPdntcQ';

describe('rssPoller integration (live YouTube RSS)', () => {
  let feedResult;

  before(async () => {
    try {
      feedResult = await fetchFeedEntries(TEST_CHANNEL_ID);
    } catch {
      // feedResult stays undefined; individual tests will skip
    }
  });

  function skipIfOffline(t) {
    if (!feedResult) {
      t.skip('Network unavailable — skipping integration test');
      return true;
    }
    return false;
  }

  describe('fetchFeedEntries', () => {
    it('returns a non-null result', (t) => {
      if (skipIfOffline(t)) return;
      assert.ok(feedResult);
    });

    it('author is a non-empty string', (t) => {
      if (skipIfOffline(t)) return;
      assert.equal(typeof feedResult.author, 'string');
      assert.ok(feedResult.author.length > 0, 'author should not be empty');
    });

    it('entries is an array with at least 1 entry', (t) => {
      if (skipIfOffline(t)) return;
      assert.ok(Array.isArray(feedResult.entries));
      assert.ok(feedResult.entries.length >= 1, 'expected at least 1 entry');
    });

    it('each entry has yt:videoId, title, and published', (t) => {
      if (skipIfOffline(t)) return;
      for (const entry of feedResult.entries) {
        assert.equal(typeof entry['yt:videoId'], 'string', 'yt:videoId should be a string');
        assert.equal(typeof entry.title, 'string', 'title should be a string');
        assert.equal(typeof entry.published, 'string', 'published should be a string');
      }
    });
  });

  describe('entryToVideoData with real entry', () => {
    it('produces correct output shape from a live entry', (t) => {
      if (skipIfOffline(t)) return;
      assert.ok(feedResult.entries.length >= 1, 'need at least one entry');

      const entry = feedResult.entries[0];
      const video = entryToVideoData(entry, feedResult.author);

      assert.equal(typeof video.videoId, 'string');
      assert.equal(typeof video.title, 'string');
      assert.equal(typeof video.author, 'string');
      assert.equal(typeof video.url, 'string');
      assert.equal(typeof video.date, 'string');
    });

    it('url matches https://www.youtube.com/watch?v={videoId}', (t) => {
      if (skipIfOffline(t)) return;
      const entry = feedResult.entries[0];
      const video = entryToVideoData(entry, feedResult.author);

      assert.equal(video.url, `https://www.youtube.com/watch?v=${video.videoId}`);
    });

    it('videoId is an 11-character YouTube ID', (t) => {
      if (skipIfOffline(t)) return;
      const entry = feedResult.entries[0];
      const video = entryToVideoData(entry, feedResult.author);

      assert.match(video.videoId, /^[\w-]{11}$/, 'videoId should be an 11-char YouTube ID');
    });
  });

  describe('fetchLatestVideo', () => {
    it('returns a non-null result with all expected fields', async (t) => {
      if (skipIfOffline(t)) return;

      const latest = await fetchLatestVideo(TEST_CHANNEL_ID);
      assert.ok(latest, 'fetchLatestVideo should return a result');
      assert.equal(typeof latest.videoId, 'string');
      assert.equal(typeof latest.title, 'string');
      assert.equal(typeof latest.author, 'string');
      assert.equal(typeof latest.url, 'string');
      assert.equal(typeof latest.date, 'string');
      assert.ok(latest.videoId.length > 0, 'videoId should not be empty');
    });
  });

  describe('isLiveVideo', () => {
    it('returns a boolean for a known video ID', async (t) => {
      if (skipIfOffline(t)) return;
      assert.ok(feedResult.entries.length >= 1, 'need at least one entry');

      const videoId = feedResult.entries[0]['yt:videoId'];
      const result = await isLiveVideo(videoId);

      assert.equal(typeof result, 'boolean', 'isLiveVideo should return a boolean');
    });

    // "YouTube Rewind 2019" — a regular upload that will never be live
    it('returns false for a known regular video', async (t) => {
      if (skipIfOffline(t)) return;

      const result = await isLiveVideo('YbJOTdZBX1g');
      assert.equal(result, false, 'regular upload should not be detected as live');
    });

    // "lofi hip hop radio" by Lofi Girl — a 24/7 live stream
    it('returns true for a known live stream', async (t) => {
      if (skipIfOffline(t)) return;

      const result = await isLiveVideo('jfKfPfyJRdk');
      assert.equal(result, true, '24/7 live stream should be detected as live');
    });

    // Past live stream VOD — should not be detected as currently live
    it('returns false for a known past live stream', async (t) => {
      if (skipIfOffline(t)) return;

      const result = await isLiveVideo('deExqOtEm5E');
      assert.equal(result, false, 'past live stream VOD should not be detected as live');
    });
  });
});
