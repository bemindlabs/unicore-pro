/**
 * @unicore/channels — 21+ communication channel adapters for UniCore Pro.
 *
 * Social: LINE, Facebook, Instagram, TikTok, WhatsApp, Telegram
 * Team:   Slack, Discord, Email, WebChat
 *
 * @packageDocumentation
 */

// Types
export * from './types/index.js';

// Interfaces
export * from './interfaces/index.js';

// Base adapter
export { BaseChannelAdapter } from './adapters/base-channel.adapter.js';

// Social adapters
export { LineAdapter } from './adapters/social/line.adapter.js';
export { FacebookAdapter } from './adapters/social/facebook.adapter.js';
export { InstagramAdapter } from './adapters/social/instagram.adapter.js';
export { TikTokAdapter } from './adapters/social/tiktok.adapter.js';
export { WhatsAppAdapter } from './adapters/social/whatsapp.adapter.js';
export { TelegramAdapter } from './adapters/social/telegram.adapter.js';

// Team adapters
export { SlackAdapter } from './adapters/team/slack.adapter.js';
export { DiscordAdapter } from './adapters/team/discord.adapter.js';
export {
  EmailAdapter,
  type SmtpTransport,
  type SmtpMailOptions,
  type ImapClient,
  type ParsedEmail,
} from './adapters/team/email.adapter.js';
export {
  WebChatAdapter,
  type WebChatSession,
  type WebChatInboundMessage,
} from './adapters/team/webchat.adapter.js';

// Registry
export { ChannelRegistry } from './registry/channel-registry.service.js';

// Binding
export { AgentBindingService } from './binding/agent-binding.service.js';

// Dashboard
export {
  ChannelDashboardService,
  type ChannelDashboardSummary,
  type ChannelHealthCheck,
} from './dashboard/channel-dashboard.service.js';

// Module & Factory
export {
  ChannelModule,
  ChannelFactory,
  ChannelInitializer,
  CHANNEL_CONFIGS,
  type ChannelModuleAsyncOptions,
} from './module/index.js';

// Utilities
export * from './utils/index.js';
