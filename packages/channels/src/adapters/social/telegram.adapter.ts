/**
 * Telegram Bot channel adapter.
 * Supports both webhook mode and polling mode.
 * Docs: https://core.telegram.org/bots/api
 */

import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { TelegramChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

export class TelegramAdapter extends BaseChannelAdapter {
  private pollingTimer?: ReturnType<typeof setInterval>;
  private lastUpdateId = 0;

  constructor(config: TelegramChannelConfig) {
    super(config);
  }

  private get cfg(): TelegramChannelConfig {
    return this.config as TelegramChannelConfig;
  }

  private get apiBase(): string {
    return `https://api.telegram.org/bot${this.cfg.botToken}`;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      const botInfo = await this.getMe();
      if (!botInfo.ok) throw new Error('Invalid Telegram bot token');

      if (this.cfg.polling) {
        this.startPolling();
      } else if (this.cfg.webhookUrl) {
        await this.setWebhook(this.cfg.webhookUrl);
      }

      this.setConnected();
    } catch (err) {
      this.setError(`Telegram connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    if (!this.cfg.polling && this.cfg.webhookUrl) {
      await this.deleteWebhook().catch(() => undefined);
    }
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const chatId = message.conversationId ?? message.recipientId;
      const body = this.buildTgMessage(chatId, message);

      const endpoint = this.resolveEndpoint(message);
      const res = await fetch(`${this.apiBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`Telegram API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { ok: boolean; result?: { message_id: number } };
      return this.successResult(String(result.result?.message_id));
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  /**
   * Handle inbound Telegram webhook update.
   */
  handleWebhook(update: TgUpdate): void {
    const msg = this.normalizeUpdate(update);
    if (msg) this.emit(msg);
  }

  private resolveEndpoint(message: OutboundMessage): string {
    if (message.contentType === 'image') return 'sendPhoto';
    if (message.contentType === 'video') return 'sendVideo';
    if (message.contentType === 'audio') return 'sendAudio';
    if (message.contentType === 'file') return 'sendDocument';
    return 'sendMessage';
  }

  private buildTgMessage(chatId: string, message: OutboundMessage): Record<string, unknown> {
    const base = {
      chat_id: chatId,
      reply_to_message_id: message.replyToId ? parseInt(message.replyToId, 10) : undefined,
    };

    if (message.contentType === 'image' && message.attachments?.[0]?.url) {
      return { ...base, photo: message.attachments[0].url, caption: message.text };
    }

    const replyMarkup = this.buildReplyMarkup(message);
    return { ...base, text: message.text ?? '', ...(replyMarkup && { reply_markup: replyMarkup }) };
  }

  private buildReplyMarkup(message: OutboundMessage): Record<string, unknown> | undefined {
    if (message.quickReplies?.length) {
      return {
        keyboard: [message.quickReplies.map((qr) => ({ text: qr.label }))],
        one_time_keyboard: true,
        resize_keyboard: true,
      };
    }
    if (message.buttons?.length) {
      return {
        inline_keyboard: [
          message.buttons.map((btn) => ({
            text: btn.label,
            callback_data: btn.value,
            url: btn.type === 'url' ? btn.value : undefined,
          })),
        ],
      };
    }
    return undefined;
  }

  private normalizeUpdate(update: TgUpdate): ChannelMessage | null {
    const msg = update.message ?? update.edited_message ?? update.channel_post;
    if (!msg) return null;

    // Skip messages from other bots
    if (msg.from?.is_bot) return null;

    const contentType: ChannelMessage['contentType'] = msg.photo
      ? 'image'
      : msg.video
        ? 'video'
        : msg.audio
          ? 'audio'
          : msg.document
            ? 'file'
            : msg.location
              ? 'location'
              : msg.sticker
                ? 'sticker'
                : msg.contact
                  ? 'contact'
                  : 'text';

    return this.buildMessage({
      channel: 'telegram',
      externalId: String(msg.message_id),
      text: msg.text ?? msg.caption,
      contentType,
      location: msg.location
        ? { latitude: msg.location.latitude, longitude: msg.location.longitude }
        : undefined,
      contact: msg.contact
        ? {
            name: `${msg.contact.first_name ?? ''} ${msg.contact.last_name ?? ''}`.trim(),
            phone: msg.contact.phone_number,
          }
        : undefined,
      sender: {
        id: String(msg.from?.id ?? msg.chat.id),
        name: msg.from?.first_name,
        username: msg.from?.username,
        isBot: msg.from?.is_bot ?? false,
      },
      conversation: {
        id: String(msg.chat.id),
        type: msg.chat.type === 'private' ? 'direct' : msg.chat.type === 'group' ? 'group' : 'channel',
        name: msg.chat.title,
      },
      timestamp: new Date(msg.date * 1000).toISOString(),
      replyToId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      rawPayload: update as unknown as Record<string, unknown>,
    });
  }

  private startPolling(): void {
    const interval = this.cfg.pollingInterval ?? 2000;
    this.pollingTimer = setInterval(async () => {
      try {
        await this.poll();
      } catch {
        // swallow polling errors
      }
    }, interval);
  }

  private async poll(): Promise<void> {
    const res = await fetch(
      `${this.apiBase}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { ok: boolean; result: TgUpdate[] };
    for (const update of data.result ?? []) {
      this.lastUpdateId = update.update_id;
      const msg = this.normalizeUpdate(update);
      if (msg) this.emit(msg);
    }
  }

  private async getMe(): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.apiBase}/getMe`);
    return res.json() as Promise<{ ok: boolean }>;
  }

  private async setWebhook(url: string): Promise<void> {
    const res = await fetch(`${this.apiBase}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`setWebhook failed: ${res.status}`);
  }

  private async deleteWebhook(): Promise<void> {
    await fetch(`${this.apiBase}/deleteWebhook`, { method: 'POST' });
  }
}

// ─── Telegram types (minimal) ────────────────────────────────────────────────

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  callback_query?: { id: string; data?: string; from: TgUser };
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string; title?: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
  location?: { latitude: number; longitude: number };
  contact?: { phone_number?: string; first_name?: string; last_name?: string };
  reply_to_message?: { message_id: number };
}

interface TgUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}
