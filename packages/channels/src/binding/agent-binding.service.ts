/**
 * AgentBindingService — binds AI agents to channel adapters.
 * Routes inbound messages from channels to the bound agent's Observable stream.
 * Routes outbound messages from agents to the correct channel adapter.
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, Subscription, filter } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { IAgentBindingService, AgentChannelBinding } from '../interfaces/agent-binding.interface.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../types/channel-message.types.js';
import type { ChannelRegistry } from '../registry/channel-registry.service.js';

@Injectable()
export class AgentBindingService implements IAgentBindingService, OnModuleDestroy {
  /** All bindings keyed by bindingId */
  private readonly bindings = new Map<string, AgentChannelBinding>();

  /**
   * Per-agent Subject — all messages destined for an agent are pushed here.
   * Key: agentId
   */
  private readonly agentSubjects = new Map<string, Subject<ChannelMessage>>();

  /**
   * Channel subscriptions — each binding subscribes to the adapter's receive() stream.
   * Key: bindingId
   */
  private readonly subscriptions = new Map<string, Subscription>();

  constructor(private readonly registry: ChannelRegistry) {}

  bind(
    agentId: string,
    channelId: string,
    metadata?: Record<string, unknown>,
  ): AgentChannelBinding {
    const adapter = this.registry.get(channelId);
    if (!adapter) {
      throw new Error(`AgentBindingService: no adapter registered for channelId "${channelId}"`);
    }

    const bindingId = uuidv4();
    const binding: AgentChannelBinding = {
      bindingId,
      agentId,
      channelId,
      boundAt: new Date().toISOString(),
      active: true,
      metadata,
    };

    this.bindings.set(bindingId, binding);

    // Ensure the agent has a Subject
    if (!this.agentSubjects.has(agentId)) {
      this.agentSubjects.set(agentId, new Subject<ChannelMessage>());
    }
    const subject = this.agentSubjects.get(agentId)!;

    // Subscribe to this adapter's receive stream
    const sub = adapter
      .receive()
      .pipe(
        filter((msg) => {
          // Apply sender filter if set
          if (binding.senderFilter?.length) {
            return binding.senderFilter.includes(msg.sender.id);
          }
          return true;
        }),
      )
      .subscribe({
        next: (msg) => subject.next(msg),
        error: (err) => subject.error(err),
      });

    this.subscriptions.set(bindingId, sub);

    return binding;
  }

  unbind(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (!binding) return;

    const sub = this.subscriptions.get(bindingId);
    sub?.unsubscribe();
    this.subscriptions.delete(bindingId);

    binding.active = false;
    this.bindings.delete(bindingId);
  }

  unbindAgent(agentId: string): void {
    for (const binding of this.bindings.values()) {
      if (binding.agentId === agentId) {
        this.unbind(binding.bindingId);
      }
    }
    const subject = this.agentSubjects.get(agentId);
    subject?.complete();
    this.agentSubjects.delete(agentId);
  }

  unbindChannel(channelId: string): void {
    for (const binding of this.bindings.values()) {
      if (binding.channelId === channelId) {
        this.unbind(binding.bindingId);
      }
    }
  }

  getBindingsForAgent(agentId: string): AgentChannelBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.agentId === agentId && b.active);
  }

  getBindingsForChannel(channelId: string): AgentChannelBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.channelId === channelId && b.active);
  }

  getBinding(bindingId: string): AgentChannelBinding | undefined {
    return this.bindings.get(bindingId);
  }

  listBindings(): AgentChannelBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.active);
  }

  getAgentStream(agentId: string): Observable<ChannelMessage> {
    if (!this.agentSubjects.has(agentId)) {
      this.agentSubjects.set(agentId, new Subject<ChannelMessage>());
    }
    return this.agentSubjects.get(agentId)!.asObservable();
  }

  async routeOutbound(agentId: string, message: OutboundMessage): Promise<SendResult[]> {
    const agentBindings = this.getBindingsForAgent(agentId);

    if (agentBindings.length === 0) {
      return [
        {
          success: false,
          timestamp: new Date().toISOString(),
          error: `No active channel bindings for agent "${agentId}"`,
        },
      ];
    }

    // If a specific channelId is set on the message, route only to that channel
    const targets =
      message.channelId
        ? agentBindings.filter((b) => b.channelId === message.channelId)
        : agentBindings;

    const results = await Promise.allSettled(
      targets.map(async (binding) => {
        const adapter = this.registry.get(binding.channelId);
        if (!adapter) {
          return {
            success: false,
            timestamp: new Date().toISOString(),
            error: `Adapter "${binding.channelId}" not found`,
          } satisfies SendResult;
        }
        return adapter.send(message);
      }),
    );

    return results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            success: false,
            timestamp: new Date().toISOString(),
            error: (r.reason as Error).message,
          },
    );
  }

  onModuleDestroy(): void {
    for (const sub of this.subscriptions.values()) sub.unsubscribe();
    for (const subject of this.agentSubjects.values()) subject.complete();
    this.subscriptions.clear();
    this.agentSubjects.clear();
    this.bindings.clear();
  }
}
