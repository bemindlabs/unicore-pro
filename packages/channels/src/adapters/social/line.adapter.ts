/**
 * LINE channel adapter.
 * Uses LINE Messaging API (webhook-based).
 * Docs: https://developers.line.biz/en/docs/messaging-api/
 */

import { createHmac } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { LineChannelConfig } from '../../types/channel-config.types.js';
import type {
  ChannelMessage,
  OutboundMessage,
  SendResult,
} from '../../types/channel-message.types.js';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

export class LineAdapter extends BaseChannelAdapter {
  constructor(config: LineChannelConfig) {
    super(config);
  }

  private get cfg(): LineChannelConfig {
    return this.config as LineChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      // Verify credentials by fetching bot info
      await this.fetchBotInfo();
      this.setConnected();
    } catch (err) {
      this.setError(`LINE connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // LINE is webhook-only; disconnect means we stop accepting webhook calls
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const body = this.buildReplyOrPushBody(message);
      const endpoint = message.replyToId
        ? `${LINE_API_BASE}/message/reply`
        : `${LINE_API_BASE}/message/push`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.channelAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        return this.failResult(`LINE API error ${response.status}: ${errText}`);
      }

      return this.successResult(undefined, { endpoint });
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  /**
   * Handle an inbound LINE webhook event payload.
   * Call this from your NestJS controller that receives LINE webhooks.
   */
  handleWebhook(rawBody: Buffer, signature: string): void {
    if (!this.verifySignature(rawBody, signature)) {
      throw new Error('LINE webhook signature verification failed');
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as LineWebhookPayload;

    for (const event of payload.events) {
      if (event.type === 'message') {
        const msg = this.normalizeEvent(event as LineMessageEvent);
        if (msg) this.emit(msg);
      }
    }
  }

  private verifySignature(body: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.cfg.channelSecret)
      .update(body)
      .digest('base64');
    return expected === signature;
  }

  private normalizeEvent(event: LineMessageEvent): ChannelMessage | null {
    const { message: lineMsg, source, replyToken, timestamp } = event;

    const contentTypeMap: Record<string, ChannelMessage['contentType']> = {
      text: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      file: 'file',
      location: 'location',
      sticker: 'sticker',
    };

    return this.buildMessage({
      channel: 'line',
      externalId: lineMsg.id,
      direction: 'inbound',
      text: lineMsg.type === 'text' ? (lineMsg as LineTextMessage).text : undefined,
      contentType: contentTypeMap[lineMsg.type] ?? 'unknown',
      location:
        lineMsg.type === 'location'
          ? {
              latitude: (lineMsg as LineLocationMessage).latitude,
              longitude: (lineMsg as LineLocationMessage).longitude,
              address: (lineMsg as LineLocationMessage).address,
              label: (lineMsg as LineLocationMessage).title,
            }
          : undefined,
      sender: {
        id: source.userId ?? source.groupId ?? source.roomId ?? 'unknown',
        isBot: false,
      },
      conversation: {
        id: source.groupId ?? source.roomId ?? source.userId ?? 'unknown',
        type: source.type === 'group' ? 'group' : source.type === 'room' ? 'channel' : 'direct',
      },
      timestamp: new Date(timestamp).toISOString(),
      rawPayload: { replyToken, source, message: lineMsg },
    });
  }

  private buildReplyOrPushBody(message: OutboundMessage): Record<string, unknown> {
    const lineMessage = this.buildLineMessage(message);

    if (message.replyToId) {
      return { replyToken: message.replyToId, messages: [lineMessage] };
    }
    return { to: message.recipientId, messages: [lineMessage] };
  }

  private buildLineMessage(message: OutboundMessage): Record<string, unknown> {
    if (message.contentType === 'image' && message.attachments?.[0]?.url) {
      return {
        type: 'image',
        originalContentUrl: message.attachments[0].url,
        previewImageUrl: message.attachments[0].url,
      };
    }
    if (message.quickReplies?.length) {
      return {
        type: 'text',
        text: message.text ?? '',
        quickReply: {
          items: message.quickReplies.map((qr) => ({
            type: 'action',
            action: { type: 'message', label: qr.label, text: qr.payload },
          })),
        },
      };
    }
    return { type: 'text', text: message.text ?? '' };
  }

  private async fetchBotInfo(): Promise<void> {
    const res = await fetch(`${LINE_API_BASE}/info`, {
      headers: { Authorization: `Bearer ${this.cfg.channelAccessToken}` },
    });
    if (!res.ok) throw new Error(`LINE bot info fetch failed: ${res.status}`);
  }
}

// ─── LINE Webhook payload types (minimal) ────────────────────────────────────

interface LineWebhookPayload {
  destination: string;
  events: LineEvent[];
}

type LineEvent = LineMessageEvent | { type: string };

interface LineMessageEvent {
  type: 'message';
  replyToken: string;
  source: LineSource;
  timestamp: number;
  message: LineMessage;
}

interface LineSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

type LineMessage =
  | LineTextMessage
  | LineLocationMessage
  | { type: string; id: string };

interface LineTextMessage {
  type: 'text';
  id: string;
  text: string;
}

interface LineLocationMessage {
  type: 'location';
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}
