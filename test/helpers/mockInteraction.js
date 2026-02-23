const { mock } = require('node:test');

function createMockInteraction(commandName, options = {}) {
  return {
    commandName,
    isChatInputCommand: () => true,
    reply: mock.fn(),
    deferReply: mock.fn(),
    editReply: mock.fn(),
    guild: {
      members: {
        me: { id: 'bot-id' },
      },
    },
    client: {
      channels: {
        fetch: mock.fn(),
      },
    },
    options: {
      getString: mock.fn((name) => options[name] ?? null),
      getChannel: mock.fn((name) => options[name] ?? null),
      getInteger: mock.fn((name) => options[name] ?? null),
    },
  };
}

function createMockChannel(id = 'mock-channel-id') {
  const mockMessage = {
    crosspost: mock.fn(),
  };
  return {
    id,
    send: mock.fn(async () => mockMessage),
    permissionsFor: mock.fn(() => ({
      has: mock.fn(() => true),
    })),
    _mockMessage: mockMessage,
  };
}

module.exports = { createMockInteraction, createMockChannel };
