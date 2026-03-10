/**
 * Unified channel message format for all adapters.
 * All adapters normalize their native message format into ChannelMessage.
 */

export type ChannelType =
  // Social channels
  | 'line'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  // Team channels
  | 'slack'
  | 'discord'
  | 'email'
  | 'webchat'
  // Extended social
  | 'twitter'
  | 'linkedin'
  | 'youtube'
  | 'pinterest'
  | 'viber'
  | 'wechat'
  | 'zalo'
  | 'kakaotalk'
  | 'signal'
  | 'sms'
  | 'teams'
  | 'custom';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'unsent';

export type ContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'location'
  | 'contact'
  | 'sticker'
  | 'template'
  | 'carousel'
  | 'quick_reply'
  | 'button'
  | 'rich_menu'
  | 'interactive'
  | 'reaction'
  | 'unknown';

export interface MessageAttachment {
  type: ContentType;
  url?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  /** Raw provider-specific data for the attachment */
  raw?: Record<string, unknown>;
}

export interface MessageLocation {
  latitude: number;
  longitude: number;
  address?: string;
  label?: string;
}

export interface MessageContact {
  name: string;
  phone?: string;
  email?: string;
}

export interface QuickReply {
  label: string;
  payload: string;
  imageUrl?: string;
}

export interface ButtonAction {
  type: 'url' | 'postback' | 'message' | 'call' | 'share';
  label: string;
  value: string;
}

export interface ChannelSender {
  /** Provider-specific user/account ID */
  id: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  /** Whether this sender is the bot/agent itself */
  isBot?: boolean;
  /** Raw provider-specific sender data */
  raw?: Record<string, unknown>;
}

export interface ChannelConversation {
  /** Provider-specific conversation/thread/room ID */
  id: string;
  type?: 'direct' | 'group' | 'channel' | 'thread';
  name?: string;
}

/**
 * Unified message format. All channel adapters normalize to/from this type.
 */
export interface ChannelMessage {
  /** UniCore-assigned message ID */
  id: string;
  /** Provider-assigned message ID (may differ from id) */
  externalId?: string;
  /** Which channel this message originated from or is destined for */
  channel: ChannelType;
  /** Unique identifier of the channel adapter instance */
  channelId: string;
  /** Message direction relative to the platform */
  direction: MessageDirection;
  /** Primary text content */
  text?: string;
  /** Content type — used to determine how to render/process the message */
  contentType: ContentType;
  /** File/media attachments */
  attachments?: MessageAttachment[];
  /** Location payload */
  location?: MessageLocation;
  /** Contact card payload */
  contact?: MessageContact;
  /** Quick reply options offered to the user */
  quickReplies?: QuickReply[];
  /** Interactive button actions */
  buttons?: ButtonAction[];
  /** Sender information */
  sender: ChannelSender;
  /** Conversation/thread context */
  conversation: ChannelConversation;
  /** Message timestamp (ISO 8601) */
  timestamp: string;
  /** Delivery/read status */
  status: MessageStatus;
  /** ID of the message this is replying to */
  replyToId?: string;
  /** Locale/language hint (BCP-47) */
  locale?: string;
  /** Raw provider payload — preserved for auditing and provider-specific handling */
  rawPayload?: Record<string, unknown>;
  /** Arbitrary metadata (e.g., campaign tags, routing hints) */
  metadata?: Record<string, unknown>;
}

/**
 * Outbound message request — subset of ChannelMessage used when sending.
 */
export type OutboundMessage = Pick<
  ChannelMessage,
  | 'channel'
  | 'channelId'
  | 'text'
  | 'contentType'
  | 'attachments'
  | 'location'
  | 'contact'
  | 'quickReplies'
  | 'buttons'
  | 'metadata'
> & {
  /** Recipient identifier (user ID, phone number, email, etc.) */
  recipientId: string;
  /** Conversation to send to (optional — adapter may derive from recipientId) */
  conversationId?: string;
  /** Reply-to message ID */
  replyToId?: string;
};

/**
 * Result of a send operation.
 */
export interface SendResult {
  success: boolean;
  externalId?: string;
  timestamp: string;
  error?: string;
  /** Raw provider response */
  raw?: Record<string, unknown>;
}
