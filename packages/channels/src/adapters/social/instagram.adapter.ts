/**
 * Instagram Messaging channel adapter.
 * Uses Meta Instagram Messaging API (webhook-based).
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
 */

import { createHmac } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { InstagramChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export class InstagramAdapter extends BaseChannelAdapter {
  constructor(config: InstagramChannelConfig) {
    super(config);
  }

  private get cfg(): InstagramChannelConfig {
    return this.config as InstagramChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      await this.subscribeWebhook();
      this.setConnected();
    } catch (err) {
      this.setError(`Instagram connect failed: ${(err as Error).message}`);
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
        recipient: { id: message.recipientId },
        message: { text: message.text },
      };

      const res = await fetch(
        `${GRAPH_API_BASE}/${this.cfg.instagramAccountId}/messages?access_token=${this.cfg.accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`Instagram API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { message_id?: string };
      return this.successResult(result.message_id);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  handleWebhook(rawBody: Buffer, xHubSignature: string): void {
    this.verifySignature(rawBody, xHubSignature);

    const payload = JSON.parse(rawBody.toString('utf-8')) as IgWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (event.message && !event.message.is_echo) {
          const msg = this.normalizeEvent(event);
          this.emit(msg);
        }
      }
    }
  }

  verifyChallenge(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.cfg.verifyToken) return challenge;
    throw new Error('Instagram webhook verification failed');
  }

  private verifySignature(body: Buffer, signature: string): void {
    const expected =
      'sha256=' + createHmac('sha256', this.cfg.appSecret).update(body).digest('hex');
    if (expected !== signature) throw new Error('Instagram webhook signature mismatch');
  }

  private normalizeEvent(event: IgMessagingEvent): ChannelMessage {
    const { sender, recipient, timestamp, message } = event;
    return this.buildMessage({
      channel: 'instagram',
      externalId: message?.mid,
      text: message?.text,
      contentType:
        message?.attachments?.length
          ? (message.attachments[0].type as ChannelMessage['contentType']) ?? 'image'
          : 'text',
      attachments: message?.attachments?.map((a) => ({
        type: (a.type as ChannelMessage['contentType']) ?? 'image',
        url: a.payload?.url,
      })),
      sender: { id: sender.id, isBot: false },
      conversation: { id: sender.id, type: 'direct' },
      timestamp: new Date(timestamp).toISOString(),
      rawPayload: { sender, recipient, message },
    });
  }

  private async subscribeWebhook(): Promise<void> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${this.cfg.instagramAccountId}/subscribed_apps?access_token=${this.cfg.accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: ['messages'] }),
      },
    );
    if (!res.ok) throw new Error(`Instagram webhook subscribe failed: ${res.status}`);
  }
}

// ─── Instagram Webhook payload types (minimal) ───────────────────────────────

interface IgWebhookPayload {
  object: string;
  entry?: IgEntry[];
}

interface IgEntry {
  id: string;
  time: number;
  messaging?: IgMessagingEvent[];
}

interface IgMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: IgMessage;
}

interface IgMessage {
  mid: string;
  text?: string;
  is_echo?: boolean;
  attachments?: Array<{ type: string; payload?: { url?: string } }>;
}
