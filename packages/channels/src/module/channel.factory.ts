/**
 * ChannelFactory — creates typed adapter instances from configuration objects.
 * Decouples the module from specific adapter constructors.
 */

import type { IChannelAdapter } from '../interfaces/channel-adapter.interface.js';
import type { ChannelConfig } from '../types/channel-config.types.js';
import { LineAdapter } from '../adapters/social/line.adapter.js';
import { FacebookAdapter } from '../adapters/social/facebook.adapter.js';
import { InstagramAdapter } from '../adapters/social/instagram.adapter.js';
import { TikTokAdapter } from '../adapters/social/tiktok.adapter.js';
import { WhatsAppAdapter } from '../adapters/social/whatsapp.adapter.js';
import { TelegramAdapter } from '../adapters/social/telegram.adapter.js';
import { SlackAdapter } from '../adapters/team/slack.adapter.js';
import { DiscordAdapter } from '../adapters/team/discord.adapter.js';
import { EmailAdapter } from '../adapters/team/email.adapter.js';
import { WebChatAdapter } from '../adapters/team/webchat.adapter.js';

export class ChannelFactory {
  /**
   * Instantiate the correct adapter from a ChannelConfig object.
   */
  static create(config: ChannelConfig): IChannelAdapter {
    switch (config.type) {
      case 'line':
        return new LineAdapter(config);
      case 'facebook':
        return new FacebookAdapter(config);
      case 'instagram':
        return new InstagramAdapter(config);
      case 'tiktok':
        return new TikTokAdapter(config);
      case 'whatsapp':
        return new WhatsAppAdapter(config);
      case 'telegram':
        return new TelegramAdapter(config);
      case 'slack':
        return new SlackAdapter(config);
      case 'discord':
        return new DiscordAdapter(config);
      case 'email':
        return new EmailAdapter(config);
      case 'webchat':
        return new WebChatAdapter(config);
      default:
        throw new Error(`ChannelFactory: unsupported channel type "${(config as ChannelConfig).type}"`);
    }
  }

  /**
   * Batch-create adapters from an array of configs.
   */
  static createAll(configs: ChannelConfig[]): IChannelAdapter[] {
    return configs.map((c) => ChannelFactory.create(c));
  }
}
