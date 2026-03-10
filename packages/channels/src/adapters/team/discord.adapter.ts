/**
 * Discord channel adapter.
 * Uses Discord REST API + Interactions/Gateway webhooks.
 * Docs: https://discord.com/developers/docs/
 */

import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { DiscordChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class DiscordAdapter extends BaseChannelAdapter {
  constructor(config: DiscordChannelConfig) {
    super(config);
  }

  private get cfg(): DiscordChannelConfig {
    return this.config as DiscordChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      await this.fetchBotUser();
      this.setConnected();
    } catch (err) {
      this.setError(`Discord connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const channelId = message.conversationId ?? this.cfg.defaultChannelId ?? message.recipientId;
      const body = this.buildDiscordMessage(message);

      const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${this.cfg.botToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`Discord API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { id?: string };
      return this.successResult(result.id);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  /**
   * Handle inbound Discord gateway webhook event (MESSAGE_CREATE).
   */
  handleWebhook(event: DiscordGatewayEvent): void {
    if (event.t === 'MESSAGE_CREATE' && event.d) {
      const msg = this.normalizeMessage(event.d);
      if (msg) this.emit(msg);
    }
  }

  private normalizeMessage(d: DiscordMessage): ChannelMessage | null {
    // Skip bot messages and webhook messages
    if (d.author.bot || d.webhook_id) return null;

    // Filter to configured guilds if specified
    if (this.cfg.guildIds?.length && d.guild_id && !this.cfg.guildIds.includes(d.guild_id)) {
      return null;
    }

    return this.buildMessage({
      channel: 'discord',
      externalId: d.id,
      text: d.content || undefined,
      contentType: d.attachments?.length ? 'file' : d.embeds?.length ? 'interactive' : 'text',
      attachments: d.attachments?.map((a) => ({
        type: 'file' as const,
        url: a.url,
        filename: a.filename,
        size: a.size,
      })),
      sender: {
        id: d.author.id,
        name: d.author.username,
        username: d.author.username,
        isBot: false,
      },
      conversation: {
        id: d.channel_id,
        type: d.guild_id ? 'channel' : 'direct',
      },
      replyToId: d.message_reference?.message_id,
      rawPayload: d as unknown as Record<string, unknown>,
    });
  }

  private buildDiscordMessage(message: OutboundMessage): Record<string, unknown> {
    const base: Record<string, unknown> = {
      content: message.text ?? '',
    };

    if (message.replyToId) {
      base.message_reference = { message_id: message.replyToId };
    }

    if (message.buttons?.length) {
      base.components = [
        {
          type: 1, // Action row
          components: message.buttons.slice(0, 5).map((btn) => ({
            type: 2, // Button
            style: btn.type === 'url' ? 5 : 1,
            label: btn.label,
            custom_id: btn.type !== 'url' ? btn.value : undefined,
            url: btn.type === 'url' ? btn.value : undefined,
          })),
        },
      ];
    }

    if (message.attachments?.[0]?.url) {
      base.embeds = [{ image: { url: message.attachments[0].url } }];
    }

    return base;
  }

  private async fetchBotUser(): Promise<void> {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bot ${this.cfg.botToken}` },
    });
    if (!res.ok) throw new Error(`Discord bot user fetch failed: ${res.status}`);
  }
}

// ─── Discord types (minimal) ─────────────────────────────────────────────────

interface DiscordGatewayEvent {
  t: string;
  d?: DiscordMessage;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  webhook_id?: string;
  content: string;
  author: { id: string; username: string; bot?: boolean };
  attachments?: Array<{ url: string; filename: string; size: number }>;
  embeds?: unknown[];
  message_reference?: { message_id?: string };
  timestamp: string;
}
