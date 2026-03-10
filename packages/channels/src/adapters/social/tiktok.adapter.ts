/**
 * TikTok channel adapter.
 * Uses TikTok for Developers — Direct Messages API.
 * Docs: https://developers.tiktok.com/
 */

import { createHmac } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { TikTokChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokAdapter extends BaseChannelAdapter {
  private accessToken: string;

  constructor(config: TikTokChannelConfig) {
    super(config);
    this.accessToken = config.accessToken;
  }

  private get cfg(): TikTokChannelConfig {
    return this.config as TikTokChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      // Validate token by fetching user info
      await this.fetchUserInfo();
      this.setConnected();
    } catch (err) {
      this.setError(`TikTok connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const body = {
        recipient_user_id: message.recipientId,
        message_type: 'text',
        content: { text: message.text ?? '' },
      };

      const res = await fetch(`${TIKTOK_API_BASE}/dm/send/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`TikTok API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { data?: { message_id?: string } };
      return this.successResult(result.data?.message_id);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  handleWebhook(rawBody: Buffer, signature: string): void {
    this.verifySignature(rawBody, signature);

    const payload = JSON.parse(rawBody.toString('utf-8')) as TikTokWebhookPayload;

    for (const event of payload.events ?? []) {
      if (event.event_type === 'direct_message') {
        const msg = this.normalizeEvent(event);
        this.emit(msg);
      }
    }
  }

  private verifySignature(body: Buffer, signature: string): void {
    const expected = createHmac('sha256', this.cfg.clientSecret).update(body).digest('hex');
    if (expected !== signature) throw new Error('TikTok webhook signature mismatch');
  }

  private normalizeEvent(event: TikTokDmEvent): ChannelMessage {
    return this.buildMessage({
      channel: 'tiktok',
      externalId: event.message_id,
      text: event.content?.text,
      contentType: event.message_type === 'text' ? 'text' : 'image',
      sender: { id: event.sender_id, isBot: false },
      conversation: { id: event.conversation_id ?? event.sender_id, type: 'direct' },
      rawPayload: event as unknown as Record<string, unknown>,
    });
  }

  private async fetchUserInfo(): Promise<void> {
    const res = await fetch(
      `${TIKTOK_API_BASE}/user/info/?fields=open_id,display_name`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );
    if (!res.ok) throw new Error(`TikTok user info failed: ${res.status}`);
  }
}

// ─── TikTok Webhook payload types (minimal) ──────────────────────────────────

interface TikTokWebhookPayload {
  events?: TikTokDmEvent[];
}

interface TikTokDmEvent {
  event_type: string;
  message_id: string;
  sender_id: string;
  conversation_id?: string;
  message_type: string;
  content?: { text?: string };
  create_time?: number;
}
