/**
 * ChannelDashboardService — aggregates channel health, statistics, and
 * binding summaries for the UniCore dashboard UI.
 */

import { Injectable } from '@nestjs/common';
import type { ChannelRegistry } from '../registry/channel-registry.service.js';
import type { AgentBindingService } from '../binding/agent-binding.service.js';
import type { ChannelStatusSnapshot } from '../types/channel-config.types.js';
import type { AgentChannelBinding } from '../interfaces/agent-binding.interface.js';

export interface ChannelDashboardSummary {
  totalChannels: number;
  connected: number;
  disconnected: number;
  errors: number;
  channels: ChannelStatusSnapshot[];
  bindings: AgentChannelBinding[];
  generatedAt: string;
}

export interface ChannelHealthCheck {
  channelId: string;
  healthy: boolean;
  status: string;
  lastActivity?: string;
  errorMessage?: string;
}

@Injectable()
export class ChannelDashboardService {
  constructor(
    private readonly registry: ChannelRegistry,
    private readonly bindingService: AgentBindingService,
  ) {}

  /**
   * Get a full dashboard summary — all channels + all bindings.
   */
  getSummary(): ChannelDashboardSummary {
    const channels = this.registry.listStatus();
    const bindings = this.bindingService.listBindings();

    const connected = channels.filter((c) => c.status === 'connected').length;
    const disconnected = channels.filter((c) => c.status === 'disconnected').length;
    const errors = channels.filter((c) => c.status === 'error').length;

    return {
      totalChannels: channels.length,
      connected,
      disconnected,
      errors,
      channels,
      bindings,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Health check for all channels.
   */
  healthCheck(): ChannelHealthCheck[] {
    return this.registry.listStatus().map((snapshot) => ({
      channelId: snapshot.channelId,
      healthy: snapshot.status === 'connected',
      status: snapshot.status,
      lastActivity: snapshot.lastActivity,
      errorMessage: snapshot.errorMessage,
    }));
  }

  /**
   * Get all channels assigned to a specific agent.
   */
  getAgentChannels(agentId: string): ChannelStatusSnapshot[] {
    const bindings = this.bindingService.getBindingsForAgent(agentId);
    return bindings
      .map((b) => this.registry.get(b.channelId)?.getStatus())
      .filter((s): s is ChannelStatusSnapshot => s !== undefined);
  }

  /**
   * Get all agents bound to a specific channel.
   */
  getChannelAgents(channelId: string): AgentChannelBinding[] {
    return this.bindingService.getBindingsForChannel(channelId);
  }
}
