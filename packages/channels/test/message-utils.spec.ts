/**
 * Tests for message utility functions.
 */

import {
  isTextOnly,
  hasAttachments,
  extractText,
  redactMessage,
  isMediaContentType,
  buildReply,
} from '../src/utils/message.utils';
import type { ChannelMessage } from '../src/types/channel-message.types';

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'webchat',
    channelId: 'ch-1',
    direction: 'inbound',
    contentType: 'text',
    text: 'Hello',
    sender: { id: 'user-abc123' },
    conversation: { id: 'sess-1' },
    timestamp: new Date().toISOString(),
    status: 'delivered',
    rawPayload: { secret: 'raw-data' },
    ...overrides,
  };
}

describe('message utils', () => {
  describe('isTextOnly', () => {
    it('returns true for a plain text message', () => {
      expect(isTextOnly(makeMessage())).toBe(true);
    });

    it('returns false for image contentType', () => {
      expect(isTextOnly(makeMessage({ contentType: 'image' }))).toBe(false);
    });

    it('returns false when attachments are present', () => {
      expect(
        isTextOnly(makeMessage({ attachments: [{ type: 'file', url: 'http://x.com/f' }] })),
      ).toBe(false);
    });
  });

  describe('hasAttachments', () => {
    it('returns false when no attachments', () => {
      expect(hasAttachments(makeMessage())).toBe(false);
    });

    it('returns true when attachments present', () => {
      expect(
        hasAttachments(makeMessage({ attachments: [{ type: 'image', url: 'http://x.com/img' }] })),
      ).toBe(true);
    });
  });

  describe('extractText', () => {
    it('returns text from message', () => {
      expect(extractText(makeMessage({ text: 'Hello world' }))).toBe('Hello world');
    });

    it('returns empty string when no text', () => {
      expect(extractText(makeMessage({ text: undefined }))).toBe('');
    });
  });

  describe('redactMessage', () => {
    it('removes rawPayload', () => {
      const redacted = redactMessage(makeMessage());
      expect('rawPayload' in redacted).toBe(false);
    });

    it('truncates sender ID', () => {
      const redacted = redactMessage(makeMessage({ sender: { id: 'user-abc123xyz' } }));
      expect(redacted.sender.id).toContain('***');
      expect(redacted.sender.id.length).toBeLessThan('user-abc123xyz'.length);
    });
  });

  describe('isMediaContentType', () => {
    it('returns true for image, video, audio, file', () => {
      expect(isMediaContentType('image')).toBe(true);
      expect(isMediaContentType('video')).toBe(true);
      expect(isMediaContentType('audio')).toBe(true);
      expect(isMediaContentType('file')).toBe(true);
    });

    it('returns false for text, sticker, location', () => {
      expect(isMediaContentType('text')).toBe(false);
      expect(isMediaContentType('sticker')).toBe(false);
      expect(isMediaContentType('location')).toBe(false);
    });
  });

  describe('buildReply', () => {
    it('creates an outbound message targeting the sender', () => {
      const inbound = makeMessage({ sender: { id: 'user-xyz' }, conversation: { id: 'sess-99' } });
      const reply = buildReply(inbound, 'Hello back!');

      expect(reply.recipientId).toBe('user-xyz');
      expect(reply.conversationId).toBe('sess-99');
      expect(reply.text).toBe('Hello back!');
      expect(reply.contentType).toBe('text');
      expect(reply.replyToId).toBe('msg-1');
    });
  });
});
