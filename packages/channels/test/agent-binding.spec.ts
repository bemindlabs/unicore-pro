/**
 * Tests for AgentBindingService.
 */

import { firstValueFrom, take, toArray } from 'rxjs';
import { ChannelRegistry } from '../src/registry/channel-registry.service';
import { AgentBindingService } from '../src/binding/agent-binding.service';
import { BaseChannelAdapter } from '../src/adapters/base-channel.adapter';
import type { OutboundMessage, SendResult } from '../src/types/channel-message.types';
import type { WebChatChannelConfig } from '../src/types/channel-config.types';

// ─── Stubs ───────────────────────────────────────────────────────────────────

function makeConfig(id: string): WebChatChannelConfig {
  return {
    type: 'webchat',
    channelId: id,
    displayName: `WebChat ${id}`,
    apiKey: 'test-key',
  };
}

class EmittingAdapter extends BaseChannelAdapter {
  async connect(): Promise<void> { this.setConnected(); }
  async disconnect(): Promise<void> { this.setDisconnected(); }
  async send(_msg: OutboundMessage): Promise<SendResult> {
    return this.successResult('sent-id');
  }

  /** Expose emit for testing */
  public emitTestMessage(text: string): void {
    this.emit(
      this.buildMessage({
        channel: 'webchat',
        text,
        contentType: 'text',
        sender: { id: 'visitor-1' },
        conversation: { id: 'session-1' },
      }),
    );
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentBindingService', () => {
  let registry: ChannelRegistry;
  let service: AgentBindingService;
  let adapter: EmittingAdapter;

  beforeEach(() => {
    registry = new ChannelRegistry();
    adapter = new EmittingAdapter(makeConfig('ch-1'));
    registry.register(adapter);
    service = new AgentBindingService(registry);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('binds an agent to a channel', () => {
    const binding = service.bind('agent-comms', 'ch-1');
    expect(binding.agentId).toBe('agent-comms');
    expect(binding.channelId).toBe('ch-1');
    expect(binding.active).toBe(true);
  });

  it('throws when binding to a non-existent channelId', () => {
    expect(() => service.bind('agent-comms', 'no-such-channel')).toThrow(
      'no adapter registered',
    );
  });

  it('routes inbound messages to bound agent stream', (done) => {
    service.bind('agent-comms', 'ch-1');

    service.getAgentStream('agent-comms').pipe(take(1)).subscribe({
      next: (msg) => {
        expect(msg.text).toBe('Hello from visitor');
        expect(msg.channelId).toBe('ch-1');
        done();
      },
      error: done,
    });

    adapter.emitTestMessage('Hello from visitor');
  });

  it('routes messages from multiple channels to one agent', (done) => {
    const adapter2 = new EmittingAdapter(makeConfig('ch-2'));
    registry.register(adapter2);

    service.bind('agent-comms', 'ch-1');
    service.bind('agent-comms', 'ch-2');

    const received: import('../src/types/channel-message.types').ChannelMessage[] = [];

    service.getAgentStream('agent-comms').pipe(take(2), toArray()).subscribe({
      next: (messages) => {
        expect(messages).toHaveLength(2);
        const channelIds = messages.map((m) => m.channelId);
        expect(channelIds).toContain('ch-1');
        expect(channelIds).toContain('ch-2');
        void received; // suppress lint
        done();
      },
      error: done,
    });

    adapter.emitTestMessage('msg from ch-1');
    adapter2.emitTestMessage('msg from ch-2');
  });

  it('unbinds by bindingId', () => {
    const binding = service.bind('agent-comms', 'ch-1');
    service.unbind(binding.bindingId);
    expect(service.listBindings()).toHaveLength(0);
  });

  it('unbinds all channels for an agent', () => {
    const adapter2 = new EmittingAdapter(makeConfig('ch-2'));
    registry.register(adapter2);

    service.bind('agent-comms', 'ch-1');
    service.bind('agent-comms', 'ch-2');
    service.unbindAgent('agent-comms');

    expect(service.getBindingsForAgent('agent-comms')).toHaveLength(0);
  });

  it('getBindingsForAgent returns active bindings', () => {
    service.bind('agent-a', 'ch-1');
    service.bind('agent-b', 'ch-1');

    expect(service.getBindingsForAgent('agent-a')).toHaveLength(1);
    expect(service.getBindingsForAgent('agent-b')).toHaveLength(1);
  });

  it('getBindingsForChannel returns all agents on a channel', () => {
    service.bind('agent-a', 'ch-1');
    service.bind('agent-b', 'ch-1');

    expect(service.getBindingsForChannel('ch-1')).toHaveLength(2);
  });

  it('routeOutbound sends to all bound channels', async () => {
    service.bind('agent-comms', 'ch-1');

    const results = await service.routeOutbound('agent-comms', {
      channel: 'webchat',
      channelId: 'ch-1',
      recipientId: 'visitor-1',
      text: 'Hello!',
      contentType: 'text',
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it('routeOutbound returns error result when agent has no bindings', async () => {
    const results = await service.routeOutbound('agent-unbound', {
      channel: 'webchat',
      channelId: 'ch-1',
      recipientId: 'visitor-1',
      text: 'Hi',
      contentType: 'text',
    });

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('No active channel bindings');
  });
});
