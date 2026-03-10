/**
 * Slack channel adapter.
 * Uses Slack Web API + Events API (webhook) or Socket Mode.
 * Docs: https://api.slack.com/
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { SlackChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

const SLACK_API_BASE = 'https://slack.com/api';

export class SlackAdapter extends BaseChannelAdapter {
  constructor(config: SlackChannelConfig) {
    super(config);
  }

  private get cfg(): SlackChannelConfig {
    return this.config as SlackChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      const authTest = await this.authTest();
      if (!authTest.ok) throw new Error(`Slack auth.test failed: ${authTest.error}`);
      this.setConnected();
    } catch (err) {
      this.setError(`Slack connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const channel = message.conversationId ?? this.cfg.defaultChannel ?? message.recipientId;
      const body = this.buildSlackMessage(channel, message);

      const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${this.cfg.botToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        return this.failResult(`Slack HTTP error: ${res.status}`);
      }

      const result = (await res.json()) as SlackApiResponse;
      if (!result.ok) return this.failResult(`Slack API error: ${result.error}`);

      return this.successResult(result.ts, { channel: result.channel });
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  handleWebhook(rawBody: Buffer, slackSignature: string, timestamp: string): void {
    this.verifySignature(rawBody, slackSignature, timestamp);

    const payload = JSON.parse(rawBody.toString('utf-8')) as SlackEventPayload;

    if (payload.type === 'url_verification') {
      // Challenge handled separately via verifyChallenge()
      return;
    }

    if (payload.type === 'event_callback' && payload.event) {
      const { event } = payload;
      if (event.type === 'message' && !event.subtype && !event.bot_id) {
        const msg = this.normalizeEvent(event, payload.team_id);
        this.emit(msg);
      }
    }
  }

  verifyChallenge(payload: { type: string; challenge?: string }): string | undefined {
    if (payload.type === 'url_verification') return payload.challenge;
    return undefined;
  }

  private verifySignature(body: Buffer, signature: string, timestamp: string): void {
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      throw new Error('Slack webhook timestamp too old');
    }
    const sigBaseStr = `v0:${timestamp}:${body.toString('utf-8')}`;
    const expected = 'v0=' + createHmac('sha256', this.cfg.signingSecret).update(sigBaseStr).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('Slack webhook signature mismatch');
    }
  }

  private normalizeEvent(event: SlackMessageEvent, teamId: string): ChannelMessage {
    return this.buildMessage({
      channel: 'slack',
      externalId: event.ts,
      text: event.text,
      contentType: event.files?.length ? 'file' : 'text',
      attachments: event.files?.map((f) => ({
        type: 'file' as const,
        url: f.url_private,
        filename: f.name,
        mimeType: f.mimetype,
      })),
      sender: { id: event.user, isBot: false },
      conversation: {
        id: event.channel,
        type: event.channel_type === 'im' ? 'direct' : event.thread_ts ? 'thread' : 'channel',
      },
      replyToId: event.thread_ts !== event.ts ? event.thread_ts : undefined,
      rawPayload: { event, teamId },
    });
  }

  private buildSlackMessage(channel: string, message: OutboundMessage): Record<string, unknown> {
    const base: Record<string, unknown> = {
      channel,
      text: message.text ?? '',
      thread_ts: message.replyToId,
    };

    if (message.buttons?.length || message.quickReplies?.length) {
      const actions = [
        ...(message.quickReplies ?? []).map((qr) => ({
          type: 'button',
          text: { type: 'plain_text', text: qr.label },
          value: qr.payload,
          action_id: qr.payload,
        })),
        ...(message.buttons ?? []).map((btn) => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.label },
          value: btn.value,
          action_id: btn.value,
        })),
      ];

      base.blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: message.text ?? '' } },
        { type: 'actions', elements: actions },
      ];
    }

    return base;
  }

  private async authTest(): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${SLACK_API_BASE}/auth.test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.botToken}` },
    });
    return res.json() as Promise<{ ok: boolean; error?: string }>;
  }
}

// ─── Slack types (minimal) ───────────────────────────────────────────────────

interface SlackEventPayload {
  type: string;
  team_id: string;
  event?: SlackMessageEvent;
  challenge?: string;
}

interface SlackMessageEvent {
  type: string;
  subtype?: string;
  ts: string;
  thread_ts?: string;
  text?: string;
  user: string;
  bot_id?: string;
  channel: string;
  channel_type?: string;
  files?: Array<{ name: string; url_private?: string; mimetype?: string }>;
}

interface SlackApiResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}
