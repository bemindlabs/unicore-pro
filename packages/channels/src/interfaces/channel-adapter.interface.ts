/**
 * Core ChannelAdapter interface.
 * Every channel adapter (LINE, Slack, WhatsApp, etc.) must implement this contract.
 */

import type { Observable } from 'rxjs';
import type {
  ChannelMessage,
  OutboundMessage,
  SendResult,
} from '../types/channel-message.types.js';
import type {
  ChannelConfig,
  ChannelStatusSnapshot,
} from '../types/channel-config.types.js';

export interface IChannelAdapter {
  /** Unique stable identifier for this adapter instance */
  readonly channelId: string;
  /** Human-readable name */
  readonly displayName: string;

  /**
   * Establish connection to the channel provider.
   * Registers webhooks, starts polling, opens WebSocket, etc.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnect from the channel provider.
   * Deregisters webhooks, stops polling, closes connections.
   */
  disconnect(): Promise<void>;

  /**
   * Send a message via this channel.
   * @param message - The outbound message to send.
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * Observable stream of inbound messages from this channel.
   * Emits whenever a message is received from an end-user.
   */
  receive(): Observable<ChannelMessage>;

  /**
   * Return the current status snapshot of the channel.
   */
  getStatus(): ChannelStatusSnapshot;

  /**
   * Return the channel configuration (credentials are redacted).
   */
  getConfig(): ChannelConfig;
}

/** Injection token for the adapter interface */
export const CHANNEL_ADAPTER = Symbol('CHANNEL_ADAPTER');
