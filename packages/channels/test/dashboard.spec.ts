/**
 * Tests for ChannelDashboardService.
 */

import { ChannelRegistry } from '../src/registry/channel-registry.service';
import { AgentBindingService } from '../src/binding/agent-binding.service';
import { ChannelDashboardService } from '../src/dashboard/channel-dashboard.service';
import { BaseChannelAdapter } from '../src/adapters/base-channel.adapter';
import type { OutboundMessage, SendResult } from '../src/types/channel-message.types';
import type { WebChatChannelConfig } from '../src/types/channel-config.types';

class StubAdapter extends BaseChannelAdapter {
  async connect(): Promise<void> { this.setConnected(); }
  async disconnect(): Promise<void> { this.setDisconnected(); }
  async send(_msg: OutboundMessage): Promise<SendResult> { return this.successResult(); }
}

function makeConfig(id: string): WebChatChannelConfig {
  return { type: 'webchat', channelId: id, displayName: `Chat ${id}`, apiKey: 'k' };
}

describe('ChannelDashboardService', () => {
  let registry: ChannelRegistry;
  let bindingService: AgentBindingService;
  let dashboard: ChannelDashboardService;

  beforeEach(async () => {
    registry = new ChannelRegistry();
    bindingService = new AgentBindingService(registry);
    dashboard = new ChannelDashboardService(registry, bindingService);

    const a1 = new StubAdapter(makeConfig('ch-1'));
    const a2 = new StubAdapter(makeConfig('ch-2'));
    registry.register(a1);
    registry.register(a2);
    await a1.connect();
    // a2 remains disconnected
  });

  afterEach(() => {
    bindingService.onModuleDestroy();
  });

  it('getSummary counts connected and disconnected', () => {
    const summary = dashboard.getSummary();
    expect(summary.totalChannels).toBe(2);
    expect(summary.connected).toBe(1);
    expect(summary.disconnected).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it('getSummary includes bindings', () => {
    bindingService.bind('agent-x', 'ch-1');
    const summary = dashboard.getSummary();
    expect(summary.bindings).toHaveLength(1);
  });

  it('healthCheck returns healthy status per channel', () => {
    const health = dashboard.healthCheck();
    expect(health).toHaveLength(2);

    const ch1 = health.find((h) => h.channelId === 'ch-1');
    const ch2 = health.find((h) => h.channelId === 'ch-2');

    expect(ch1?.healthy).toBe(true);
    expect(ch2?.healthy).toBe(false);
  });

  it('getAgentChannels returns channels for an agent', () => {
    bindingService.bind('agent-y', 'ch-1');
    const channels = dashboard.getAgentChannels('agent-y');
    expect(channels).toHaveLength(1);
    expect(channels[0].channelId).toBe('ch-1');
  });

  it('getChannelAgents returns agents on a channel', () => {
    bindingService.bind('agent-a', 'ch-1');
    bindingService.bind('agent-b', 'ch-1');
    const agents = dashboard.getChannelAgents('ch-1');
    expect(agents).toHaveLength(2);
  });
});
