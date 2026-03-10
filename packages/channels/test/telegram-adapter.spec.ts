/**
 * Tests for TelegramAdapter.
 */

import { firstValueFrom, take } from 'rxjs';
import { TelegramAdapter } from '../src/adapters/social/telegram.adapter';
import type { TelegramChannelConfig } from '../src/types/channel-config.types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const config: TelegramChannelConfig = {
  type: 'telegram',
  channelId: 'tg-main',
  displayName: 'Telegram Main',
  botToken: 'bot123:TOKEN',
  polling: false,
};

const TG_API = 'https://api.telegram.org/botbot123:TOKEN';

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new TelegramAdapter(config);
  });

  afterEach(async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await adapter.disconnect();
  });

  it('connects successfully when bot token is valid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: { id: 1, username: 'mybot' } }),
    });

    await adapter.connect();
    expect(adapter.getStatus().status).toBe('connected');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/getMe'));
  });

  it('sets error state when bot token is invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false }),
    });

    await expect(adapter.connect()).rejects.toThrow('Invalid Telegram bot token');
    expect(adapter.getStatus().status).toBe('error');
  });

  it('sends a text message', async () => {
    // Connect first
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      // Send message
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      });

    await adapter.connect();
    const result = await adapter.send({
      channel: 'telegram',
      channelId: 'tg-main',
      recipientId: '123456',
      text: 'Hello from UniCore!',
      contentType: 'text',
    });

    expect(result.success).toBe(true);
    expect(result.externalId).toBe('42');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends an image message using sendPhoto', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 99 } }),
      });

    await adapter.connect();
    const result = await adapter.send({
      channel: 'telegram',
      channelId: 'tg-main',
      recipientId: '123456',
      contentType: 'image',
      attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendPhoto'),
      expect.anything(),
    );
  });

  it('returns fail result when Telegram API returns non-OK HTTP', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad Request' });

    await adapter.connect();
    const result = await adapter.send({
      channel: 'telegram',
      channelId: 'tg-main',
      recipientId: '123456',
      text: 'Hello',
      contentType: 'text',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });

  it('emits inbound messages via handleWebhook', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await adapter.connect();

    const msgPromise = firstValueFrom(adapter.receive().pipe(take(1)));

    adapter.handleWebhook({
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: 111, is_bot: false, first_name: 'Alice', username: 'alice' },
        chat: { id: 111, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hey bot!',
      },
    });

    const msg = await msgPromise;
    expect(msg.text).toBe('Hey bot!');
    expect(msg.channel).toBe('telegram');
    expect(msg.sender.id).toBe('111');
    expect(msg.sender.username).toBe('alice');
    expect(msg.conversation.type).toBe('direct');
  });

  it('does not emit message from bot accounts', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await adapter.connect();

    const emitted: unknown[] = [];
    adapter.receive().subscribe((msg) => { emitted.push(msg); });

    // Bot message should be filtered out — normalizeUpdate returns null for bots
    const result = adapter['normalizeUpdate']({
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 999, is_bot: true, first_name: 'Bot' },
        chat: { id: 999, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Bot message',
      },
    });

    expect(result).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('normalizes location messages', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await adapter.connect();

    const msgPromise = firstValueFrom(adapter.receive().pipe(take(1)));

    adapter.handleWebhook({
      update_id: 3,
      message: {
        message_id: 20,
        from: { id: 222, is_bot: false, first_name: 'Bob' },
        chat: { id: 222, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        location: { latitude: 13.756, longitude: 100.502 },
      },
    });

    const msg = await msgPromise;
    expect(msg.contentType).toBe('location');
    expect(msg.location?.latitude).toBe(13.756);
    expect(msg.location?.longitude).toBe(100.502);
  });
});
