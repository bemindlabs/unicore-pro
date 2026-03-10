/**
 * WebChat channel adapter.
 * Powers the embedded web chat widget that can be added to any website.
 * Uses an HTTP polling or WebSocket-based model — the adapter manages
 * active sessions and message queues per visitor session.
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { WebChatChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

export interface WebChatSession {
  sessionId: string;
  visitorId: string;
  startedAt: string;
  lastActivity: string;
  locale?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface WebChatInboundMessage {
  sessionId: string;
  visitorId: string;
  text?: string;
  contentType?: string;
  apiKey: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Queued outbound message waiting to be polled by the widget.
 */
interface QueuedOutbound {
  id: string;
  message: OutboundMessage;
  queuedAt: string;
}

export class WebChatAdapter extends BaseChannelAdapter {
  /** Active sessions keyed by sessionId */
  private readonly sessions = new Map<string, WebChatSession>();
  /** Outbound message queue keyed by visitorId — widget polls for new messages */
  private readonly outboundQueue = new Map<string, QueuedOutbound[]>();

  constructor(config: WebChatChannelConfig) {
    super(config);
  }

  private get cfg(): WebChatChannelConfig {
    return this.config as WebChatChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    this.setConnected();
  }

  async disconnect(): Promise<void> {
    this.sessions.clear();
    this.outboundQueue.clear();
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    // Queue message for visitor to poll
    const queue = this.outboundQueue.get(message.recipientId) ?? [];
    queue.push({
      id: uuidv4(),
      message,
      queuedAt: new Date().toISOString(),
    });
    this.outboundQueue.set(message.recipientId, queue);

    return this.successResult(uuidv4());
  }

  /**
   * Handle inbound message from the WebChat widget.
   * Call from the HTTP controller that receives widget POST requests.
   */
  handleInbound(payload: WebChatInboundMessage): void {
    this.authenticateRequest(payload.apiKey);

    // Create or update session
    const session = this.getOrCreateSession(payload);

    const msg = this.normalizeWebChatMessage(payload, session);
    this.emit(msg);
  }

  /**
   * Start a new chat session (called by widget on load).
   */
  startSession(visitorId: string, metadata?: Record<string, unknown>): WebChatSession {
    const session: WebChatSession = {
      sessionId: uuidv4(),
      visitorId,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata,
    };
    this.sessions.set(session.sessionId, session);

    // Send greeting if configured
    if (this.cfg.greeting) {
      const greetingMsg: OutboundMessage = {
        channel: 'webchat',
        channelId: this.channelId,
        recipientId: visitorId,
        conversationId: session.sessionId,
        text: this.cfg.greeting,
        contentType: 'text',
      };
      void this.send(greetingMsg);
    }

    return session;
  }

  /**
   * Poll for pending outbound messages for a visitor.
   * Called by the WebChat widget on an interval.
   */
  pollMessages(visitorId: string, apiKey: string): QueuedOutbound[] {
    this.authenticateRequest(apiKey);
    const queue = this.outboundQueue.get(visitorId) ?? [];
    this.outboundQueue.delete(visitorId); // Clear after delivery
    return queue;
  }

  /**
   * End a chat session.
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getActiveSessions(): WebChatSession[] {
    return Array.from(this.sessions.values());
  }

  private authenticateRequest(apiKey: string): void {
    if (apiKey !== this.cfg.apiKey) {
      throw new Error('WebChat: invalid API key');
    }
  }

  private getOrCreateSession(payload: WebChatInboundMessage): WebChatSession {
    let session = this.sessions.get(payload.sessionId);
    if (!session) {
      session = {
        sessionId: payload.sessionId,
        visitorId: payload.visitorId,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        locale: payload.locale,
        metadata: payload.metadata,
      };
      this.sessions.set(session.sessionId, session);
    }
    session.lastActivity = new Date().toISOString();
    return session;
  }

  private normalizeWebChatMessage(
    payload: WebChatInboundMessage,
    session: WebChatSession,
  ): ChannelMessage {
    return this.buildMessage({
      channel: 'webchat',
      text: payload.text,
      contentType: (payload.contentType as ChannelMessage['contentType']) ?? 'text',
      sender: { id: payload.visitorId, isBot: false },
      conversation: { id: session.sessionId, type: 'direct' },
      locale: payload.locale,
      metadata: payload.metadata,
      rawPayload: payload as unknown as Record<string, unknown>,
    });
  }
}
