/**
 * Configuration types for channel adapters.
 */

import type { ChannelType } from './channel-message.types.js';

export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'initializing' | 'reconnecting';

/**
 * Base configuration common to all channel adapters.
 */
export interface BaseChannelConfig {
  /** Unique identifier for this channel instance (e.g., "line-main", "slack-support") */
  channelId: string;
  /** Human-readable display name */
  displayName: string;
  /** Whether this channel is active */
  enabled?: boolean;
  /** Webhook URL that this adapter listens on (if applicable) */
  webhookUrl?: string;
  /** Webhook secret for payload signature verification */
  webhookSecret?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

// ─── Social Channels ────────────────────────────────────────────────────────

export interface LineChannelConfig extends BaseChannelConfig {
  type: 'line';
  channelAccessToken: string;
  channelSecret: string;
  /** Optional LINE group/room ID to restrict to */
  groupId?: string;
}

export interface FacebookChannelConfig extends BaseChannelConfig {
  type: 'facebook';
  pageAccessToken: string;
  appSecret: string;
  pageId: string;
  verifyToken: string;
}

export interface InstagramChannelConfig extends BaseChannelConfig {
  type: 'instagram';
  accessToken: string;
  appSecret: string;
  instagramAccountId: string;
  verifyToken: string;
}

export interface TikTokChannelConfig extends BaseChannelConfig {
  type: 'tiktok';
  clientKey: string;
  clientSecret: string;
  accessToken: string;
  openId: string;
}

export interface WhatsAppChannelConfig extends BaseChannelConfig {
  type: 'whatsapp';
  /** WhatsApp Business API access token */
  accessToken: string;
  /** Phone number ID from Meta Business */
  phoneNumberId: string;
  /** Business account ID */
  businessAccountId: string;
  verifyToken: string;
  /** Graph API version, e.g. "v19.0" */
  apiVersion?: string;
}

export interface TelegramChannelConfig extends BaseChannelConfig {
  type: 'telegram';
  botToken: string;
  /** Restrict to a specific chat ID */
  chatId?: string | number;
  /** Use polling instead of webhook */
  polling?: boolean;
  pollingInterval?: number;
}

// ─── Team Channels ───────────────────────────────────────────────────────────

export interface SlackChannelConfig extends BaseChannelConfig {
  type: 'slack';
  botToken: string;
  appToken?: string;
  signingSecret: string;
  /** Default channel to post to */
  defaultChannel?: string;
  /** Use Socket Mode instead of HTTP events */
  socketMode?: boolean;
}

export interface DiscordChannelConfig extends BaseChannelConfig {
  type: 'discord';
  botToken: string;
  applicationId: string;
  /** Guild IDs to operate in */
  guildIds?: string[];
  /** Default text channel ID */
  defaultChannelId?: string;
}

export interface EmailChannelConfig extends BaseChannelConfig {
  type: 'email';
  /** SMTP configuration for outbound */
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  /** IMAP configuration for inbound polling */
  imap?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    /** Mailbox to monitor, default "INBOX" */
    mailbox?: string;
    /** Polling interval in milliseconds */
    pollingInterval?: number;
  };
  /** From address for outbound emails */
  from: string;
  /** Display name for the from address */
  fromName?: string;
}

export interface WebChatChannelConfig extends BaseChannelConfig {
  type: 'webchat';
  /** API key for authenticating WebChat widget requests */
  apiKey: string;
  /** Allowed origins for CORS */
  allowedOrigins?: string[];
  /** Initial greeting message */
  greeting?: string;
  /** Session timeout in seconds */
  sessionTimeout?: number;
  /** Whether to persist chat history */
  persistHistory?: boolean;
}

// ─── Union type ──────────────────────────────────────────────────────────────

export type ChannelConfig =
  | LineChannelConfig
  | FacebookChannelConfig
  | InstagramChannelConfig
  | TikTokChannelConfig
  | WhatsAppChannelConfig
  | TelegramChannelConfig
  | SlackChannelConfig
  | DiscordChannelConfig
  | EmailChannelConfig
  | WebChatChannelConfig;

/**
 * Runtime channel status snapshot.
 */
export interface ChannelStatusSnapshot {
  channelId: string;
  type: ChannelType;
  displayName: string;
  status: ChannelStatus;
  connectedAt?: string;
  lastActivity?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}
