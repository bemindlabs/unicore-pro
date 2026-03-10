/**
 * Utility helpers for working with ChannelMessage objects.
 */

import type { ChannelMessage, ContentType } from '../types/channel-message.types.js';

/**
 * Returns true if the message contains no media or interactive content.
 */
export function isTextOnly(message: ChannelMessage): boolean {
  return message.contentType === 'text' && !message.attachments?.length;
}

/**
 * Returns true if the message has at least one file/image attachment.
 */
export function hasAttachments(message: ChannelMessage): boolean {
  return (message.attachments?.length ?? 0) > 0;
}

/**
 * Extract plain text from a message regardless of content type.
 * Falls back to empty string if no text is available.
 */
export function extractText(message: ChannelMessage): string {
  return message.text ?? '';
}

/**
 * Redact sensitive fields from a message for safe logging.
 */
export function redactMessage(message: ChannelMessage): Omit<ChannelMessage, 'rawPayload'> {
  const { rawPayload: _, ...safe } = message;
  return {
    ...safe,
    sender: {
      ...message.sender,
      // Truncate sender ID for privacy
      id: message.sender.id.substring(0, 8) + '***',
    },
  };
}

/**
 * Determine whether a content type represents a media attachment.
 */
export function isMediaContentType(type: ContentType): boolean {
  return ['image', 'video', 'audio', 'file'].includes(type);
}

/**
 * Build a simple text reply OutboundMessage from an inbound message.
 */
export function buildReply(
  inbound: ChannelMessage,
  text: string,
): import('../types/channel-message.types.js').OutboundMessage {
  return {
    channel: inbound.channel,
    channelId: inbound.channelId,
    recipientId: inbound.sender.id,
    conversationId: inbound.conversation.id,
    replyToId: inbound.id,
    text,
    contentType: 'text',
  };
}
