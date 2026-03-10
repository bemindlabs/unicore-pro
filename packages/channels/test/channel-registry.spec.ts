/**
 * Tests for ChannelRegistry service.
 */

import { ChannelRegistry } from '../src/registry/channel-registry.service';
import { BaseChannelAdapter } from '../src/adapters/base-channel.adapter';
import type { OutboundMessage, SendResult } from '../src/types/channel-message.types';
import type { WebChatChannelConfig } from '../src/types/channel-config.types';

// ─── Minimal adapter stub ────────────────────────────────────────────────────

function makeConfig(id: string): WebChatChannelConfig {
  return {
    type: 'webchat',
    channelId: id,
    displayName: `WebChat ${id}`,
    apiKey: 'test-key',
  };
}

class StubAdapter extends BaseChannelAdapter {
  connectCalled = false;
  disconnectCalled = false;

  async connect(): Promise<void> {
    this.connectCalled = true;
    this.setConnected();
  }

  async disconnect(): Promise<void> {
    this.disconnectCalled = true;
    this.setDisconnected();
  }

  async send(_message: OutboundMessage): Promise<SendResult> {
    return this.successResult('stub-id');
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it('registers an adapter', () => {
    const adapter = new StubAdapter(makeConfig('ch-1'));
    registry.register(adapter);

    expect(registry.has('ch-1')).toBe(true);
    expect(registry.get('ch-1')).toBe(adapter);
    expect(registry.size).toBe(1);
  });

  it('throws if the same channelId is registered twice', () => {
    const adapter = new StubAdapter(makeConfig('ch-1'));
    registry.register(adapter);
    expect(() => registry.register(new StubAdapter(makeConfig('ch-1')))).toThrow(
      'already registered',
    );
  });

  it('lists all adapters', () => {
    registry.register(new StubAdapter(makeConfig('a')));
    registry.register(new StubAdapter(makeConfig('b')));
    expect(registry.list()).toHaveLength(2);
  });

  it('filters list by channel type', () => {
    registry.register(new StubAdapter(makeConfig('webchat-1')));
    registry.register(new StubAdapter(makeConfig('webchat-2')));

    const webchats = registry.list('webchat');
    expect(webchats).toHaveLength(2);

    const slacks = registry.list('slack');
    expect(slacks).toHaveLength(0);
  });

  it('unregisters an adapter and calls disconnect', async () => {
    const adapter = new StubAdapter(makeConfig('ch-x'));
    registry.register(adapter);
    await registry.unregister('ch-x');

    expect(registry.has('ch-x')).toBe(false);
    expect(adapter.disconnectCalled).toBe(true);
  });

  it('unregister on unknown id does nothing', async () => {
    await expect(registry.unregister('nonexistent')).resolves.toBeUndefined();
  });

  it('connectAll connects all adapters', async () => {
    const a = new StubAdapter(makeConfig('a'));
    const b = new StubAdapter(makeConfig('b'));
    registry.register(a);
    registry.register(b);

    const results = await registry.connectAll();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(a.connectCalled).toBe(true);
    expect(b.connectCalled).toBe(true);
  });

  it('disconnectAll disconnects all adapters and clears registry', async () => {
    const a = new StubAdapter(makeConfig('a'));
    const b = new StubAdapter(makeConfig('b'));
    registry.register(a);
    registry.register(b);

    await registry.disconnectAll();
    expect(registry.size).toBe(0);
    expect(a.disconnectCalled).toBe(true);
    expect(b.disconnectCalled).toBe(true);
  });

  it('listStatus returns status snapshots', () => {
    const adapter = new StubAdapter(makeConfig('ch-1'));
    registry.register(adapter);

    const statuses = registry.listStatus();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].channelId).toBe('ch-1');
    expect(statuses[0].status).toBe('disconnected');
  });
});
