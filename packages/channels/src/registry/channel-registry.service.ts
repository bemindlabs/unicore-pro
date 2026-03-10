/**
 * ChannelRegistry — the central catalog of all active channel adapters.
 * Adapters can be registered at startup (static) or dynamically at runtime.
 */

import { Injectable } from '@nestjs/common';
import type { IChannelAdapter } from '../interfaces/channel-adapter.interface.js';
import type { IChannelRegistry } from '../interfaces/channel-registry.interface.js';
import type { ChannelType } from '../types/channel-message.types.js';
import type { ChannelStatusSnapshot } from '../types/channel-config.types.js';

@Injectable()
export class ChannelRegistry implements IChannelRegistry {
  private readonly adapters = new Map<string, IChannelAdapter>();

  /**
   * Register a channel adapter.
   * @throws {Error} if channelId already registered.
   */
  register(adapter: IChannelAdapter): void {
    if (this.adapters.has(adapter.channelId)) {
      throw new Error(
        `ChannelRegistry: adapter with channelId "${adapter.channelId}" is already registered`,
      );
    }
    this.adapters.set(adapter.channelId, adapter);
  }

  /**
   * Unregister and disconnect an adapter by channelId.
   */
  async unregister(channelId: string): Promise<void> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) return;

    await adapter.disconnect();
    this.adapters.delete(channelId);
  }

  /**
   * Look up an adapter by its channelId.
   */
  get(channelId: string): IChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }

  /**
   * List all registered adapters, optionally filtered by channel type.
   */
  list(type?: ChannelType): IChannelAdapter[] {
    const all = Array.from(this.adapters.values());
    if (!type) return all;
    return all.filter((a) => a.getConfig().type === type);
  }

  /**
   * Return status snapshots for all registered adapters.
   */
  listStatus(): ChannelStatusSnapshot[] {
    return Array.from(this.adapters.values()).map((a) => a.getStatus());
  }

  /**
   * Check whether a channelId is registered.
   */
  has(channelId: string): boolean {
    return this.adapters.has(channelId);
  }

  /**
   * Connect all registered adapters.
   * Useful for bulk startup.
   */
  async connectAll(): Promise<PromiseSettledResult<void>[]> {
    return Promise.allSettled(
      Array.from(this.adapters.values()).map((a) => a.connect()),
    );
  }

  /**
   * Disconnect all registered adapters.
   * Called during module teardown.
   */
  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.adapters.values()).map((a) => a.disconnect()),
    );
    this.adapters.clear();
  }

  get size(): number {
    return this.adapters.size;
  }
}
