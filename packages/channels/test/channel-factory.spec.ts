/**
 * Tests for ChannelFactory.
 */

import { ChannelFactory } from '../src/module/channel.factory';
import { LineAdapter } from '../src/adapters/social/line.adapter';
import { FacebookAdapter } from '../src/adapters/social/facebook.adapter';
import { InstagramAdapter } from '../src/adapters/social/instagram.adapter';
import { TikTokAdapter } from '../src/adapters/social/tiktok.adapter';
import { WhatsAppAdapter } from '../src/adapters/social/whatsapp.adapter';
import { TelegramAdapter } from '../src/adapters/social/telegram.adapter';
import { SlackAdapter } from '../src/adapters/team/slack.adapter';
import { DiscordAdapter } from '../src/adapters/team/discord.adapter';
import { EmailAdapter } from '../src/adapters/team/email.adapter';
import { WebChatAdapter } from '../src/adapters/team/webchat.adapter';
import type { ChannelConfig } from '../src/types/channel-config.types';

describe('ChannelFactory', () => {
  it('creates a LineAdapter', () => {
    const config: ChannelConfig = {
      type: 'line',
      channelId: 'line-test',
      displayName: 'LINE Test',
      channelAccessToken: 'tok',
      channelSecret: 'sec',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(LineAdapter);
  });

  it('creates a FacebookAdapter', () => {
    const config: ChannelConfig = {
      type: 'facebook',
      channelId: 'fb-test',
      displayName: 'FB Test',
      pageAccessToken: 'tok',
      appSecret: 'sec',
      pageId: 'pid',
      verifyToken: 'vtok',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(FacebookAdapter);
  });

  it('creates an InstagramAdapter', () => {
    const config: ChannelConfig = {
      type: 'instagram',
      channelId: 'ig-test',
      displayName: 'IG Test',
      accessToken: 'tok',
      appSecret: 'sec',
      instagramAccountId: 'iaid',
      verifyToken: 'vtok',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(InstagramAdapter);
  });

  it('creates a TikTokAdapter', () => {
    const config: ChannelConfig = {
      type: 'tiktok',
      channelId: 'tt-test',
      displayName: 'TikTok Test',
      clientKey: 'ck',
      clientSecret: 'cs',
      accessToken: 'tok',
      openId: 'oid',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(TikTokAdapter);
  });

  it('creates a WhatsAppAdapter', () => {
    const config: ChannelConfig = {
      type: 'whatsapp',
      channelId: 'wa-test',
      displayName: 'WA Test',
      accessToken: 'tok',
      phoneNumberId: 'pnid',
      businessAccountId: 'baid',
      verifyToken: 'vtok',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(WhatsAppAdapter);
  });

  it('creates a TelegramAdapter', () => {
    const config: ChannelConfig = {
      type: 'telegram',
      channelId: 'tg-test',
      displayName: 'Telegram Test',
      botToken: 'bot:tok',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(TelegramAdapter);
  });

  it('creates a SlackAdapter', () => {
    const config: ChannelConfig = {
      type: 'slack',
      channelId: 'slack-test',
      displayName: 'Slack Test',
      botToken: 'xoxb-token',
      signingSecret: 'sig',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(SlackAdapter);
  });

  it('creates a DiscordAdapter', () => {
    const config: ChannelConfig = {
      type: 'discord',
      channelId: 'discord-test',
      displayName: 'Discord Test',
      botToken: 'bot-tok',
      applicationId: 'app-id',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(DiscordAdapter);
  });

  it('creates an EmailAdapter', () => {
    const config: ChannelConfig = {
      type: 'email',
      channelId: 'email-test',
      displayName: 'Email Test',
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'password' },
      },
      from: 'user@example.com',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(EmailAdapter);
  });

  it('creates a WebChatAdapter', () => {
    const config: ChannelConfig = {
      type: 'webchat',
      channelId: 'webchat-test',
      displayName: 'WebChat Test',
      apiKey: 'api-key',
    };
    expect(ChannelFactory.create(config)).toBeInstanceOf(WebChatAdapter);
  });

  it('createAll creates multiple adapters', () => {
    const configs: ChannelConfig[] = [
      {
        type: 'telegram',
        channelId: 'tg-1',
        displayName: 'Telegram 1',
        botToken: 'bot:tok1',
      },
      {
        type: 'slack',
        channelId: 'slack-1',
        displayName: 'Slack 1',
        botToken: 'xoxb-1',
        signingSecret: 'sig1',
      },
    ];
    const adapters = ChannelFactory.createAll(configs);
    expect(adapters).toHaveLength(2);
    expect(adapters[0]).toBeInstanceOf(TelegramAdapter);
    expect(adapters[1]).toBeInstanceOf(SlackAdapter);
  });
});
