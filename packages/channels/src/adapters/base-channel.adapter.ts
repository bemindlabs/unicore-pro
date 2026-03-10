/**
 * Abstract base class for all channel adapters.
 * Provides shared status management, logging scaffolding, and Observable stream.
 */

import { Subject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { IChannelAdapter } from '../interfaces/channel-adapter.interface.js';
import type {
  ChannelMessage,
  OutboundMessage,
  SendResult,
} from '../types/channel-message.types.js';
import type {
  ChannelConfig,
  ChannelStatus,
  ChannelStatusSnapshot,
} from '../types/channel-config.types.js';

export abstract class BaseChannelAdapter implements IChannelAdapter {
  protected readonly messageSubject = new Subject<ChannelMessage>();
  protected status: ChannelStatus = 'disconnected';
  protected connectedAt?: string;
  protected lastActivity?: string;
  protected errorMessage?: string;

  constructor(protected readonly config: ChannelConfig) {}

  get channelId(): string {
    return this.config.channelId;
  }

  get displayName(): string {
    return this.config.displayName;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: OutboundMessage): Promise<SendResult>;

  receive(): Observable<ChannelMessage> {
    return this.messageSubject.asObservable();
  }

  getStatus(): ChannelStatusSnapshot {
    return {
      channelId: this.config.channelId,
      type: this.config.type as ChannelStatusSnapshot['type'],
      displayName: this.config.displayName,
      status: this.status,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      errorMessage: this.errorMessage,
    };
  }

  getConfig(): ChannelConfig {
    return this.config;
  }

  /**
   * Emit a normalized inbound message into the Observable stream.
   * Subclasses call this when a message is received from the provider.
   */
  protected emit(message: ChannelMessage): void {
    this.lastActivity = new Date().toISOString();
    this.messageSubject.next(message);
  }

  /**
   * Build a base ChannelMessage with common fields pre-populated.
   */
  protected buildMessage(
    partial: Omit<ChannelMessage, 'id' | 'channelId' | 'direction' | 'status' | 'timestamp'> &
      Partial<Pick<ChannelMessage, 'id' | 'direction' | 'timestamp' | 'status'>>,
  ): ChannelMessage {
    const defaults = {
      id: uuidv4(),
      channelId: this.config.channelId,
      direction: 'inbound' as const,
      status: 'delivered' as const,
      timestamp: new Date().toISOString(),
    };
    return Object.assign({}, defaults, partial) as ChannelMessage;
  }

  /**
   * Transition to connected state.
   */
  protected setConnected(): void {
    this.status = 'connected';
    this.connectedAt = new Date().toISOString();
    this.errorMessage = undefined;
  }

  /**
   * Transition to disconnected state.
   */
  protected setDisconnected(): void {
    this.status = 'disconnected';
  }

  /**
   * Transition to error state.
   */
  protected setError(message: string): void {
    this.status = 'error';
    this.errorMessage = message;
  }

  /**
   * Build a successful SendResult.
   */
  protected successResult(externalId?: string, raw?: Record<string, unknown>): SendResult {
    return {
      success: true,
      externalId,
      timestamp: new Date().toISOString(),
      raw,
    };
  }

  /**
   * Build a failed SendResult.
   */
  protected failResult(error: string, raw?: Record<string, unknown>): SendResult {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error,
      raw,
    };
  }
}
