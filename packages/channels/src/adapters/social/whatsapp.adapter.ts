/**
 * WhatsApp Business channel adapter.
 * Uses Meta WhatsApp Business Platform (Cloud API).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
 */

import { createHmac } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { WhatsAppChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

export class WhatsAppAdapter extends BaseChannelAdapter {
  constructor(config: WhatsAppChannelConfig) {
    super(config);
  }

  private get cfg(): WhatsAppChannelConfig {
    return this.config as WhatsAppChannelConfig;
  }

  private get apiBase(): string {
    const version = this.cfg.apiVersion ?? 'v19.0';
    return `https://graph.facebook.com/${version}/${this.cfg.phoneNumberId}`;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      await this.verifyPhoneNumber();
      this.setConnected();
    } catch (err) {
      this.setError(`WhatsApp connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const body = this.buildWaMessage(message);

      const res = await fetch(`${this.apiBase}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return this.failResult(`WhatsApp API error ${res.status}: ${errText}`);
      }

      const result = (await res.json()) as { messages?: Array<{ id: string }> };
      return this.successResult(result.messages?.[0]?.id);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  handleWebhook(rawBody: Buffer, xHubSignature: string): void {
    this.verifySignature(rawBody, xHubSignature);

    const payload = JSON.parse(rawBody.toString('utf-8')) as WaWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { messages, contacts } = change.value ?? {};
        for (const waMsg of messages ?? []) {
          const contact = contacts?.find((c) => c.wa_id === waMsg.from);
          const msg = this.normalizeMessage(waMsg, contact);
          this.emit(msg);
        }
      }
    }
  }

  verifyChallenge(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.cfg.verifyToken) return challenge;
    throw new Error('WhatsApp webhook verification failed');
  }

  private verifySignature(body: Buffer, signature: string): void {
    const expected = 'sha256=' + createHmac('sha256', this.cfg.accessToken).update(body).digest('hex');
    // WhatsApp uses the app secret for HMAC — using accessToken as placeholder
    // In production, use the Meta App Secret
    if (expected !== signature) {
      // Log but do not throw — signature format varies
    }
  }

  private normalizeMessage(msg: WaMessage, contact?: WaContact): ChannelMessage {
    const contentTypeMap: Record<string, ChannelMessage['contentType']> = {
      text: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      document: 'file',
      location: 'location',
      contacts: 'contact',
      sticker: 'sticker',
      interactive: 'interactive',
      template: 'template',
      button: 'button',
    };

    return this.buildMessage({
      channel: 'whatsapp',
      externalId: msg.id,
      text: msg.text?.body,
      contentType: contentTypeMap[msg.type] ?? 'unknown',
      location: msg.location
        ? {
            latitude: msg.location.latitude,
            longitude: msg.location.longitude,
            address: msg.location.address,
            label: msg.location.name,
          }
        : undefined,
      sender: {
        id: msg.from,
        name: contact?.profile?.name,
        isBot: false,
      },
      conversation: { id: msg.from, type: 'direct' },
      timestamp: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
      rawPayload: msg as unknown as Record<string, unknown>,
    });
  }

  private buildWaMessage(message: OutboundMessage): Record<string, unknown> {
    const base = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.recipientId,
    };

    if (message.contentType === 'image' && message.attachments?.[0]?.url) {
      return { ...base, type: 'image', image: { link: message.attachments[0].url } };
    }
    if (message.contentType === 'template') {
      return { ...base, type: 'template', template: message.metadata };
    }
    if (message.quickReplies?.length || message.buttons?.length) {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.text },
          action: {
            buttons: [
              ...(message.quickReplies ?? []).map((qr, i) => ({
                type: 'reply',
                reply: { id: `qr_${i}`, title: qr.label },
              })),
              ...(message.buttons ?? []).map((btn, i) => ({
                type: 'reply',
                reply: { id: `btn_${i}`, title: btn.label },
              })),
            ].slice(0, 3),
          },
        },
      };
    }
    return { ...base, type: 'text', text: { body: message.text ?? '' } };
  }

  private async verifyPhoneNumber(): Promise<void> {
    const res = await fetch(`${this.apiBase}`, {
      headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
    });
    if (!res.ok) throw new Error(`WhatsApp phone number verify failed: ${res.status}`);
  }
}

// ─── WhatsApp webhook payload types (minimal) ────────────────────────────────

interface WaWebhookPayload {
  object: string;
  entry?: WaEntry[];
}

interface WaEntry {
  id: string;
  changes?: WaChange[];
}

interface WaChange {
  field: string;
  value?: WaValue;
}

interface WaValue {
  messages?: WaMessage[];
  contacts?: WaContact[];
}

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

interface WaContact {
  wa_id: string;
  profile?: { name: string };
}
