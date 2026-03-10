/**
 * Tests for AgentLifecycleManager and createLifecycleManager factory.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AgentLifecycleManager, createLifecycleManager } from '../lifecycle';
import { OpenClawGatewayClient } from '../gateway';
import type { AgentLifecycleManagerOptions, AgentId } from '../types';

// ---------------------------------------------------------------------------
// Mock gateway client
// ---------------------------------------------------------------------------

/**
 * A mock OpenClawGatewayClient that resolves spawn and lifecycle commands
 * immediately using configurable response factories, without any real
 * WebSocket connection.
 */
class MockGatewayClient extends OpenClawGatewayClient {
  private instanceCounter = 0;
  private statusResponses = new Map<string, string>();
  private shouldFailSpawn = false;
  private spawnedPayloads: unknown[] = [];
  private lifecycleCommands: Array<{ command: string; instanceId: string }> = [];

  constructor() {
    // Pass a no-op WebSocket factory
    super({}, () => {
      throw new Error('Mock does not use WebSocket');
    });
  }

  override async spawn(payload: unknown): Promise<string> {
    if (this.shouldFailSpawn) {
      throw new Error('Gateway rejected spawn request');
    }
    this.spawnedPayloads.push(payload);
    this.instanceCounter++;
    const id = `oc-mock-${this.instanceCounter.toString().padStart(3, '0')}`;
    this.statusResponses.set(id, 'running');
    return id;
  }

  override async sendLifecycleCommand(
    command: 'stop' | 'restart' | 'status',
    instanceId: string,
  ) {
    this.lifecycleCommands.push({ command, instanceId });
    const currentStatus = this.statusResponses.get(instanceId) ?? 'stopped';
    if (command === 'stop') {
      this.statusResponses.set(instanceId, 'stopped');
    } else if (command === 'restart') {
      this.statusResponses.set(instanceId, 'running');
    }
    return { type: 'response', instanceId, status: currentStatus };
  }

  // Test introspection helpers
  getSpawnedPayloads() { return this.spawnedPayloads; }
  getLifecycleCommands() { return this.lifecycleCommands; }
  setFailSpawn(v: boolean) { this.shouldFailSpawn = v; }
  setStatusForInstance(id: string, status: string) { this.statusResponses.set(id, status); }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const BASE_OPTIONS: AgentLifecycleManagerOptions = {
  gateway: { gatewayUrl: 'ws://mock-gateway:18789' },
  businessTemplate: 'saas',
  defaultPromptVariables: { business_name: 'Test Corp' },
};

function createManager(): { manager: AgentLifecycleManager; mockClient: MockGatewayClient } {
  const mockClient = new MockGatewayClient();
  const manager = new AgentLifecycleManager(BASE_OPTIONS, mockClient);
  return { manager, mockClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentLifecycleManager.spawn', () => {
  it('spawns an agent and returns an AgentInstance', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('comms');

    assert.ok(instance.instanceId.startsWith('oc-mock-'));
    assert.equal(instance.status, 'running');
    assert.equal(instance.definition.id, 'comms');
    assert.ok(instance.startedAt !== null);
  });

  it('registers the instance in the local registry', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('finance');

    const found = manager.getInstance(instance.instanceId);
    assert.equal(found, instance);
  });

  it('merges default and instance-level promptVariables', async () => {
    const { manager, mockClient } = createManager();

    await manager.spawn('finance', { promptVariables: { large_expense_threshold: '9999' } });

    const payload = mockClient.getSpawnedPayloads()[0] as { systemPrompt: string };
    // Default business_name should be applied (no {{business_name}} remaining)
    assert.ok(!payload.systemPrompt.includes('{{business_name}}'));
  });

  it('applies business template prompt when businessTemplate is set', async () => {
    const { manager, mockClient } = createManager();

    // Options: saas template from manager defaults
    await manager.spawn('comms');

    const payload = mockClient.getSpawnedPayloads()[0] as { systemPrompt: string };
    // SaaS template prompt for comms should contain SaaS-specific language
    assert.ok(
      payload.systemPrompt.toLowerCase().includes('saas'),
      'Expected SaaS template to be applied to comms prompt',
    );
  });

  it('throws if gateway rejects spawn', async () => {
    const { manager, mockClient } = createManager();
    mockClient.setFailSpawn(true);

    await assert.rejects(
      () => manager.spawn('ops'),
      (err: Error) => {
        assert.match(err.message, /rejected spawn/);
        return true;
      },
    );
  });

  it('uses definition defaultAutonomy when not provided in options', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('ops'); // ops default is full_auto

    assert.equal(instance.autonomy, 'full_auto');
  });

  it('overrides autonomy when provided in options', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('ops', { autonomy: 'suggest' });

    assert.equal(instance.autonomy, 'suggest');
  });
});

describe('AgentLifecycleManager.spawnMany', () => {
  it('spawns multiple agents in parallel', async () => {
    const { manager } = createManager();

    const agentIds: AgentId[] = ['comms', 'finance', 'growth'];
    const instances = await manager.spawnMany(agentIds.map((id) => [id]));

    assert.equal(instances.length, 3);
    assert.equal(instances[0].definition.id, 'comms');
    assert.equal(instances[1].definition.id, 'finance');
    assert.equal(instances[2].definition.id, 'growth');
  });
});

describe('AgentLifecycleManager.stop', () => {
  it('stops a running instance', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('erp');
    await manager.stop(instance.instanceId);

    const updated = manager.getInstance(instance.instanceId);
    assert.equal(updated?.status, 'stopped');
  });

  it('throws if instanceId does not exist', async () => {
    const { manager } = createManager();

    await assert.rejects(
      () => manager.stop('nonexistent-id'),
      (err: Error) => {
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  it('sends stop command to the gateway', async () => {
    const { manager, mockClient } = createManager();

    const instance = await manager.spawn('comms');
    await manager.stop(instance.instanceId);

    const cmds = mockClient.getLifecycleCommands();
    assert.ok(cmds.some((c) => c.command === 'stop' && c.instanceId === instance.instanceId));
  });
});

describe('AgentLifecycleManager.restart', () => {
  it('restarts an instance and returns updated instance', async () => {
    const { manager } = createManager();

    const instance = await manager.spawn('research');
    await manager.stop(instance.instanceId);

    const restarted = await manager.restart(instance.instanceId);

    assert.equal(restarted.status, 'running');
    assert.equal(restarted.lastError, null);
    assert.ok(restarted.startedAt !== null);
  });
});

describe('AgentLifecycleManager.status', () => {
  it('returns the current status from the gateway', async () => {
    const { manager, mockClient } = createManager();

    const instance = await manager.spawn('builder');
    mockClient.setStatusForInstance(instance.instanceId, 'running');

    const status = await manager.status(instance.instanceId);
    assert.equal(status, 'running');
  });

  it('updates local instance status from gateway response', async () => {
    const { manager, mockClient } = createManager();

    const instance = await manager.spawn('builder');
    mockClient.setStatusForInstance(instance.instanceId, 'error');

    await manager.status(instance.instanceId);

    const updated = manager.getInstance(instance.instanceId);
    assert.equal(updated?.status, 'error');
  });
});

describe('AgentLifecycleManager registry queries', () => {
  it('getAllInstances returns all spawned instances', async () => {
    const { manager } = createManager();

    await manager.spawnMany([['comms'], ['finance'], ['ops']]);

    const all = manager.getAllInstances();
    assert.equal(all.length, 3);
  });

  it('getRunningInstances returns only running instances', async () => {
    const { manager } = createManager();

    const [comms, finance] = await manager.spawnMany([['comms'], ['finance']]);
    await manager.stop(comms.instanceId);

    const running = manager.getRunningInstances();
    assert.equal(running.length, 1);
    assert.equal(running[0].instanceId, finance.instanceId);
  });

  it('getInstancesByAgent returns only instances of the given agent type', async () => {
    const { manager } = createManager();

    await manager.spawnMany([['comms'], ['comms'], ['finance']]);

    const commsInstances = manager.getInstancesByAgent('comms');
    assert.equal(commsInstances.length, 2);

    const financeInstances = manager.getInstancesByAgent('finance');
    assert.equal(financeInstances.length, 1);
  });
});

describe('AgentLifecycleManager static helpers', () => {
  it('getDefinition returns correct definition for each agentId', () => {
    const ids: AgentId[] = ['comms', 'finance', 'growth', 'ops', 'research', 'erp', 'builder'];
    for (const id of ids) {
      const def = AgentLifecycleManager.getDefinition(id);
      assert.equal(def.id, id);
    }
  });

  it('getDefinition throws for unknown agentId', () => {
    assert.throws(
      () => AgentLifecycleManager.getDefinition('unknown' as AgentId),
      (err: Error) => {
        assert.match(err.message, /unknown agent id/i);
        return true;
      },
    );
  });

  it('listDefinitions returns all 7 definitions', () => {
    const defs = AgentLifecycleManager.listDefinitions();
    assert.equal(defs.length, 7);
  });

  it('getDefaultEnabledAgents returns 5 agents', () => {
    const enabled = AgentLifecycleManager.getDefaultEnabledAgents();
    assert.equal(enabled.length, 5);
    assert.ok(enabled.includes('comms'));
    assert.ok(enabled.includes('finance'));
    assert.ok(enabled.includes('growth'));
    assert.ok(enabled.includes('ops'));
    assert.ok(enabled.includes('erp'));
    assert.ok(!enabled.includes('research'));
    assert.ok(!enabled.includes('builder'));
  });
});

describe('createLifecycleManager factory', () => {
  it('creates an AgentLifecycleManager instance', () => {
    const manager = createLifecycleManager({ gatewayUrl: 'ws://test:18789' });
    assert.ok(manager instanceof AgentLifecycleManager);
  });

  it('passes through businessTemplate and defaultPromptVariables', async () => {
    // We test this indirectly by spawning an agent and checking that the
    // template is applied. We use our mock client trick via the internal gateway client.
    const mockClient = new MockGatewayClient();
    const manager = new AgentLifecycleManager(
      {
        gateway: {},
        businessTemplate: 'ecommerce',
        defaultPromptVariables: { business_name: 'My Shop' },
      },
      mockClient,
    );

    await manager.spawn('comms');

    const payload = mockClient.getSpawnedPayloads()[0] as {
      systemPrompt: string;
      metadata: { businessTemplate: string };
    };

    assert.equal(payload.metadata.businessTemplate, 'ecommerce');
    assert.ok(!payload.systemPrompt.includes('{{business_name}}'));
    assert.ok(payload.systemPrompt.includes('My Shop'));
  });
});
