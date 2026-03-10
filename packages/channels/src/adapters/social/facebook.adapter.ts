/**
 * Facebook Messenger channel adapter.
 * Uses Meta Graph API + Webhooks.
 * Docs: https://developers.facebook.com/docs/messenger-platform/
 */

import { createHmac } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { FacebookChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export class FacebookAdapter extends BaseChannelAdapter {
  constructor(config: FacebookChannelConfig) {
    super(config);
  }

  private get cfg(): FacebookChannelConfig {
    return this.config as FacebookChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      await this.subscribeWebhook();
      this.setConnected();
    } catch (err) {
      this.setError(`Facebook connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.unsubscribeWebhook();
    } catch {
      // best-effort
    }
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const body = {
        recipient: { id: message.recipientId },
        message: this.buildFbMessage(message),
        messaging_type: 'RESPONSE',
      };

      const res = await fetch(
        `${GRAPH_API_BASE}/me/messages?access_token=${this.cfg.pageAccessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`FB API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { message_id?: string };
      return this.successResult(result.message_id);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  /**
   * Handle inbound Facebook webhook events.
   * Call from your webhook POST controller.
   */
  handleWebhook(rawBody: Buffer, xHubSignature: string): void {
    this.verifySignature(rawBody, xHubSignature);

    const payload = JSON.parse(rawBody.toString('utf-8')) as FbWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (event.message && !event.message.is_echo) {
          const msg = this.normalizeEvent(event);
          this.emit(msg);
        }
      }
    }
  }

  /**
   * Verify webhook subscription (GET challenge).
   */
  verifyChallenge(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.cfg.verifyToken) {
      return challenge;
    }
    throw new Error('Facebook webhook verification failed');
  }

  private verifySignature(body: Buffer, signature: string): void {
    const expected =
      'sha256=' + createHmac('sha256', this.cfg.appSecret).update(body).digest('hex');
    if (expected !== signature) {
      throw new Error('Facebook webhook signature mismatch');
    }
  }

  private normalizeEvent(event: FbMessagingEvent): ChannelMessage {
    const { sender, recipient, timestamp, message } = event;

    return this.buildMessage({
      channel: 'facebook',
      externalId: message?.mid,
      text: message?.text,
      contentType: message?.attachments?.length ? 'image' : 'text',
      attachments: message?.attachments?.map((a) => ({
        type: 'image' as const,
        url: a.payload?.url,
      })),
      sender: { id: sender.id, isBot: false },
      conversation: { id: sender.id, type: 'direct' },
      timestamp: new Date(timestamp).toISOString(),
      rawPayload: { sender, recipient, message },
    });
  }

  private buildFbMessage(msg: OutboundMessage): Record<string, unknown> {
    if (msg.quickReplies?.length) {
      return {
        text: msg.text,
        quick_replies: msg.quickReplies.map((qr) => ({
          content_type: 'text',
          title: qr.label,
          payload: qr.payload,
          image_url: qr.imageUrl,
        })),
      };
    }
    if (msg.attachments?.[0]?.url) {
      return {
        attachment: {
          type: 'image',
          payload: { url: msg.attachments[0].url, is_reusable: true },
        },
      };
    }
    return { text: msg.text };
  }

  private async subscribeWebhook(): Promise<void> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${this.cfg.pageId}/subscribed_apps?access_token=${this.cfg.pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks'] }),
      },
    );
    if (!res.ok) throw new Error(`Facebook webhook subscribe failed: ${res.status}`);
  }

  private async unsubscribeWebhook(): Promise<void> {
    await fetch(
      `${GRAPH_API_BASE}/${this.cfg.pageId}/subscribed_apps?access_token=${this.cfg.pageAccessToken}`,
      { method: 'DELETE' },
    );
  }
}

// ─── Facebook Webhook payload types (minimal) ────────────────────────────────

interface FbWebhookPayload {
  object: string;
  entry?: FbEntry[];
}

interface FbEntry {
  id: string;
  time: number;
  messaging?: FbMessagingEvent[];
}

interface FbMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: FbMessage;
}

interface FbMessage {
  mid: string;
  text?: string;
  is_echo?: boolean;
  attachments?: Array<{ type: string; payload?: { url?: string } }>;
}
