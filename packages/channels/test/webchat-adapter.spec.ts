/**
 * Tests for WebChatAdapter.
 */

import { firstValueFrom, take } from 'rxjs';
import { WebChatAdapter } from '../src/adapters/team/webchat.adapter';
import type { WebChatChannelConfig } from '../src/types/channel-config.types';

const config: WebChatChannelConfig = {
  type: 'webchat',
  channelId: 'webchat-1',
  displayName: 'Test WebChat',
  apiKey: 'secret-key',
  greeting: 'Welcome! How can I help?',
};

describe('WebChatAdapter', () => {
  let adapter: WebChatAdapter;

  beforeEach(async () => {
    adapter = new WebChatAdapter(config);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('connects and reports connected status', () => {
    expect(adapter.getStatus().status).toBe('connected');
  });

  it('starts a session and queues greeting message', () => {
    const session = adapter.startSession('visitor-123');
    expect(session.visitorId).toBe('visitor-123');
    expect(session.sessionId).toBeDefined();

    const messages = adapter.pollMessages('visitor-123', 'secret-key');
    expect(messages).toHaveLength(1);
    expect(messages[0].message.text).toBe('Welcome! How can I help?');
  });

  it('rejects pollMessages with wrong API key', () => {
    adapter.startSession('visitor-456');
    expect(() => adapter.pollMessages('visitor-456', 'wrong-key')).toThrow('invalid API key');
  });

  it('emits inbound messages on receive()', async () => {
    const session = adapter.startSession('visitor-789');

    const msgPromise = firstValueFrom(adapter.receive().pipe(take(1)));

    adapter.handleInbound({
      sessionId: session.sessionId,
      visitorId: 'visitor-789',
      text: 'Hello agent!',
      contentType: 'text',
      apiKey: 'secret-key',
    });

    const msg = await msgPromise;
    expect(msg.text).toBe('Hello agent!');
    expect(msg.channel).toBe('webchat');
    expect(msg.sender.id).toBe('visitor-789');
  });

  it('throws on handleInbound with wrong API key', () => {
    expect(() =>
      adapter.handleInbound({
        sessionId: 'sess-1',
        visitorId: 'v-1',
        text: 'Hi',
        apiKey: 'wrong',
      }),
    ).toThrow('invalid API key');
  });

  it('sends messages by queuing them for polling', async () => {
    const result = await adapter.send({
      channel: 'webchat',
      channelId: 'webchat-1',
      recipientId: 'visitor-999',
      text: 'Hello visitor!',
      contentType: 'text',
    });

    expect(result.success).toBe(true);

    const queued = adapter.pollMessages('visitor-999', 'secret-key');
    expect(queued).toHaveLength(1);
    expect(queued[0].message.text).toBe('Hello visitor!');
  });

  it('clears queue after polling', async () => {
    await adapter.send({
      channel: 'webchat',
      channelId: 'webchat-1',
      recipientId: 'visitor-100',
      text: 'Test',
      contentType: 'text',
    });

    adapter.pollMessages('visitor-100', 'secret-key'); // First poll
    const secondPoll = adapter.pollMessages('visitor-100', 'secret-key');
    expect(secondPoll).toHaveLength(0);
  });

  it('ends a session and removes it from active sessions', () => {
    const session = adapter.startSession('visitor-end');
    expect(adapter.getActiveSessions()).toHaveLength(1);

    adapter.endSession(session.sessionId);
    expect(adapter.getActiveSessions()).toHaveLength(0);
  });

  it('getStatus returns channelId and type', () => {
    const status = adapter.getStatus();
    expect(status.channelId).toBe('webchat-1');
    expect(status.type).toBe('webchat');
  });
});
