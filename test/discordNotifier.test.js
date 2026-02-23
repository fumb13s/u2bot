const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

const {
  applyTemplate,
  tryCrosspost,
  sendVideoNotification,
  sendLiveNotification,
} = require('../src/discordNotifier');

describe('applyTemplate', () => {
  it('replaces all placeholders', () => {
    const result = applyTemplate('{title} by {author} at {url} on {date}', {
      title: 'My Video',
      author: 'TestUser',
      url: 'https://example.com',
      date: '2024-01-01',
    });
    assert.equal(result, 'My Video by TestUser at https://example.com on 2024-01-01');
  });

  it('converts \\n to actual newlines', () => {
    const result = applyTemplate('line1\\nline2', {
      title: '',
      author: '',
      url: '',
      date: '',
    });
    assert.equal(result, 'line1\nline2');
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const result = applyTemplate('{title} - {title}', {
      title: 'Test',
      author: '',
      url: '',
      date: '',
    });
    assert.equal(result, 'Test - Test');
  });
});

describe('tryCrosspost', () => {
  it('skips when autoPublish is false', async () => {
    const message = { crosspost: mock.fn() };
    await tryCrosspost(message, { discord: { autoPublish: false } });
    assert.equal(message.crosspost.mock.callCount(), 0);
  });

  it('calls message.crosspost() when autoPublish is true', async () => {
    const message = { crosspost: mock.fn(async () => {}) };
    await tryCrosspost(message, { discord: { autoPublish: true } });
    assert.equal(message.crosspost.mock.callCount(), 1);
  });

  it('handles error code 50021 gracefully', async () => {
    const err = new Error('Not announcement channel');
    err.code = 50021;
    const message = {
      crosspost: mock.fn(async () => {
        throw err;
      }),
    };
    await assert.doesNotReject(() =>
      tryCrosspost(message, { discord: { autoPublish: true } }),
    );
  });

  it('logs other crosspost errors without throwing', async () => {
    const err = new Error('Some other error');
    err.code = 50000;
    const message = {
      crosspost: mock.fn(async () => {
        throw err;
      }),
    };
    await assert.doesNotReject(() =>
      tryCrosspost(message, { discord: { autoPublish: true } }),
    );
  });
});

describe('sendVideoNotification', () => {
  it('sends formatted content via channel.send()', async () => {
    const mockMessage = { crosspost: mock.fn() };
    const channel = { send: mock.fn(async () => mockMessage) };
    const videoData = {
      title: 'My Video',
      author: 'Author',
      url: 'https://youtube.com/watch?v=abc',
      date: '2024-01-01',
    };
    const config = {
      discord: { autoPublish: false },
      messages: { video: { content: '{author} uploaded {title}\\n{url}' } },
    };

    await sendVideoNotification(channel, videoData, config);

    assert.equal(channel.send.mock.callCount(), 1);
    const sentContent = channel.send.mock.calls[0].arguments[0].content;
    assert.ok(sentContent.includes('Author uploaded My Video'));
    assert.ok(sentContent.includes('https://youtube.com/watch?v=abc'));
  });

  it('calls tryCrosspost after sending', async () => {
    const mockMessage = { crosspost: mock.fn(async () => {}) };
    const channel = { send: mock.fn(async () => mockMessage) };
    const videoData = { title: 'T', author: 'A', url: 'http://x', date: 'd' };
    const config = {
      discord: { autoPublish: true },
      messages: { video: { content: '{url}' } },
    };

    await sendVideoNotification(channel, videoData, config);
    assert.equal(mockMessage.crosspost.mock.callCount(), 1);
  });

  it('falls back to url when template content is missing', async () => {
    const mockMessage = { crosspost: mock.fn() };
    const channel = { send: mock.fn(async () => mockMessage) };
    const videoData = {
      title: 'T',
      author: 'A',
      url: 'https://youtube.com/watch?v=fallback',
      date: 'd',
    };
    const config = {
      discord: { autoPublish: false },
      messages: { video: {} },
    };

    await sendVideoNotification(channel, videoData, config);
    const sentContent = channel.send.mock.calls[0].arguments[0].content;
    assert.equal(sentContent, 'https://youtube.com/watch?v=fallback');
  });
});

describe('sendLiveNotification', () => {
  it('sends formatted content via channel.send()', async () => {
    const mockMessage = { crosspost: mock.fn() };
    const channel = { send: mock.fn(async () => mockMessage) };
    const streamData = {
      title: 'Live Stream',
      author: 'Streamer',
      url: 'https://youtube.com/watch?v=xyz',
      date: '2024-01-01',
    };
    const config = {
      discord: { autoPublish: false },
      messages: { live: { content: '{author} is live: {title}\\n{url}' } },
    };

    await sendLiveNotification(channel, streamData, config);

    assert.equal(channel.send.mock.callCount(), 1);
    const sentContent = channel.send.mock.calls[0].arguments[0].content;
    assert.ok(sentContent.includes('Streamer is live: Live Stream'));
    assert.ok(sentContent.includes('https://youtube.com/watch?v=xyz'));
  });
});
