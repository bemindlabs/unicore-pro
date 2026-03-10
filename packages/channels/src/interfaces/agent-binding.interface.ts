/**
 * Agent binding interface — assigns AI agents to channel adapters.
 */

import type { Observable } from 'rxjs';
import type { ChannelMessage, OutboundMessage, SendResult } from '../types/channel-message.types.js';

export interface AgentChannelBinding {
  /** Unique binding ID */
  bindingId: string;
  /** Agent identifier (from OpenClaw or AgentRegistry) */
  agentId: string;
  /** Channel adapter instance ID */
  channelId: string;
  /** Bound at timestamp (ISO 8601) */
  boundAt: string;
  /** Whether this binding is currently active */
  active: boolean;
  /** Optional filter: only route messages matching these sender IDs */
  senderFilter?: string[];
  /** Metadata (e.g., routing priority, agent role) */
  metadata?: Record<string, unknown>;
}

export interface IAgentBindingService {
  /**
   * Bind an agent to a channel.
   * All inbound messages from channelId will be routed to agentId.
   */
  bind(agentId: string, channelId: string, metadata?: Record<string, unknown>): AgentChannelBinding;

  /**
   * Unbind an agent from a channel.
   */
  unbind(bindingId: string): void;

  /**
   * Unbind all channels from an agent.
   */
  unbindAgent(agentId: string): void;

  /**
   * Unbind all agents from a channel.
   */
  unbindChannel(channelId: string): void;

  /**
   * Get all bindings for an agent.
   */
  getBindingsForAgent(agentId: string): AgentChannelBinding[];

  /**
   * Get all bindings for a channel.
   */
  getBindingsForChannel(channelId: string): AgentChannelBinding[];

  /**
   * Get a specific binding by ID.
   */
  getBinding(bindingId: string): AgentChannelBinding | undefined;

  /**
   * List all active bindings.
   */
  listBindings(): AgentChannelBinding[];

  /**
   * Observable stream of messages routed to a specific agent.
   * Emits messages from all channels bound to agentId.
   */
  getAgentStream(agentId: string): Observable<ChannelMessage>;

  /**
   * Route an outbound message from an agent through its bound channel.
   */
  routeOutbound(agentId: string, message: OutboundMessage): Promise<SendResult[]>;
}

export const AGENT_BINDING_SERVICE = Symbol('AGENT_BINDING_SERVICE');
