/**
 * ChannelRegistry interface — discovers, registers, and looks up adapters.
 */

import type { IChannelAdapter } from './channel-adapter.interface.js';
import type { ChannelType } from '../types/channel-message.types.js';
import type { ChannelStatusSnapshot } from '../types/channel-config.types.js';

export interface IChannelRegistry {
  /**
   * Register a channel adapter instance.
   * @throws if an adapter with the same channelId is already registered.
   */
  register(adapter: IChannelAdapter): void;

  /**
   * Unregister a channel adapter by channelId.
   * Calls disconnect() before removing.
   */
  unregister(channelId: string): Promise<void>;

  /**
   * Look up an adapter by its channelId.
   */
  get(channelId: string): IChannelAdapter | undefined;

  /**
   * List all adapters, optionally filtered by channel type.
   */
  list(type?: ChannelType): IChannelAdapter[];

  /**
   * Return status snapshots for all registered adapters.
   */
  listStatus(): ChannelStatusSnapshot[];

  /**
   * Check whether a channelId is registered.
   */
  has(channelId: string): boolean;
}

export const CHANNEL_REGISTRY = Symbol('CHANNEL_REGISTRY');
