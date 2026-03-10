/**
 * @unicore/agents-pro — Agent lifecycle manager
 *
 * High-level API for spawning, stopping, restarting, and inspecting
 * the status of pro specialist agent instances via the OpenClaw Gateway.
 */

import type {
  AgentId,
  AgentInstance,
  AgentStatus,
  SpawnOptions,
  AgentLifecycleManagerOptions,
  OpenClawGatewayOptions,
} from './types';
import type { AgentDefinition } from './types';
import { ALL_AGENTS } from './agents/index';
import {
  OpenClawGatewayClient,
  buildSpawnPayload,
  buildAgentInstance,
} from './gateway';

/**
 * AgentLifecycleManager
 *
 * Manages the full lifecycle of pro specialist agents — spawn, stop,
 * restart, and status queries — via the OpenClaw Gateway.
 *
 * @example
 * ```ts
 * const manager = new AgentLifecycleManager({
 *   gateway: { gatewayUrl: 'ws://openclaw:18789', authToken: process.env.OPENCLAW_TOKEN },
 *   businessTemplate: 'saas',
 *   defaultPromptVariables: { business_name: 'Acme SaaS' },
 * });
 *
 * const instance = await manager.spawn('comms', {
 *   autonomy: 'approval',
 *   channels: ['email', 'slack'],
 * });
 *
 * console.log(instance.instanceId); // e.g. "oc-abc123"
 *
 * await manager.stop(instance.instanceId);
 * ```
 */
export class AgentLifecycleManager {
  private readonly client: OpenClawGatewayClient;
  private readonly options: AgentLifecycleManagerOptions;
  /** In-memory instance registry — source of truth for this manager session */
  private readonly instances = new Map<string, AgentInstance>();

  constructor(
    options: AgentLifecycleManagerOptions,
    /** Injectable gateway client (for testing) */
    gatewayClient?: OpenClawGatewayClient,
  ) {
    this.options = options;
    this.client =
      gatewayClient ??
      new OpenClawGatewayClient(options.gateway);
  }

  // ---------------------------------------------------------------------------
  // Spawn
  // ---------------------------------------------------------------------------

  /**
   * Spawn a pro specialist agent by its AgentId.
   *
   * @param agentId - One of the 7 specialist agent identifiers
   * @param spawnOptions - Override autonomy, channels, LLM provider, etc.
   * @returns The created AgentInstance registered in the local registry
   * @throws If the gateway rejects the spawn request
   */
  async spawn(agentId: AgentId, spawnOptions: SpawnOptions = {}): Promise<AgentInstance> {
    const definition = this.getDefinition(agentId);

    const mergedOptions: SpawnOptions = {
      businessTemplate: this.options.businessTemplate,
      promptVariables: {
        ...this.options.defaultPromptVariables,
        ...spawnOptions.promptVariables,
      },
      ...spawnOptions,
    };

    const payload = buildSpawnPayload(definition, mergedOptions);
    const instanceId = await this.client.spawn(payload);

    const instance = buildAgentInstance(definition, mergedOptions, instanceId);
    this.instances.set(instanceId, instance);

    return instance;
  }

  /**
   * Spawn multiple agents in parallel.
   *
   * @param requests - Array of [agentId, spawnOptions] tuples
   * @returns Array of AgentInstances in the same order as the input
   */
  async spawnMany(
    requests: Array<[AgentId, SpawnOptions?]>,
  ): Promise<AgentInstance[]> {
    return Promise.all(
      requests.map(([id, opts]) => this.spawn(id, opts ?? {})),
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle operations
  // ---------------------------------------------------------------------------

  /**
   * Stop a running agent instance.
   *
   * @param instanceId - The instanceId returned by spawn()
   */
  async stop(instanceId: string): Promise<void> {
    this.assertInstanceExists(instanceId);

    await this.client.sendLifecycleCommand('stop', instanceId);

    const instance = this.instances.get(instanceId)!;
    this.instances.set(instanceId, { ...instance, status: 'stopped' });
  }

  /**
   * Restart a running or stopped agent instance.
   * The instance retains its original configuration.
   *
   * @param instanceId - The instanceId returned by spawn()
   */
  async restart(instanceId: string): Promise<AgentInstance> {
    this.assertInstanceExists(instanceId);

    await this.client.sendLifecycleCommand('restart', instanceId);

    const instance = this.instances.get(instanceId)!;
    const updated: AgentInstance = {
      ...instance,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastError: null,
    };
    this.instances.set(instanceId, updated);

    return updated;
  }

  /**
   * Query the live status of an agent instance from the gateway.
   *
   * @param instanceId - The instanceId returned by spawn()
   * @returns The current AgentStatus as reported by the gateway
   */
  async status(instanceId: string): Promise<AgentStatus> {
    this.assertInstanceExists(instanceId);

    const response = await this.client.sendLifecycleCommand('status', instanceId);
    const liveStatus = (response.status as AgentStatus | undefined) ?? 'stopped';

    const instance = this.instances.get(instanceId)!;
    this.instances.set(instanceId, { ...instance, status: liveStatus });

    return liveStatus;
  }

  // ---------------------------------------------------------------------------
  // Registry queries
  // ---------------------------------------------------------------------------

  /**
   * Get all agent instances currently tracked by this manager.
   */
  getAllInstances(): AgentInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get all running agent instances.
   */
  getRunningInstances(): AgentInstance[] {
    return this.getAllInstances().filter((i) => i.status === 'running');
  }

  /**
   * Get the instance for a specific instanceId.
   * Returns undefined if not found.
   */
  getInstance(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get all instances of a specific agent type.
   */
  getInstancesByAgent(agentId: AgentId): AgentInstance[] {
    return this.getAllInstances().filter(
      (i) => i.definition.id === agentId,
    );
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the AgentDefinition for a given AgentId without instantiating a manager.
   */
  static getDefinition(agentId: AgentId): AgentDefinition {
    const def = ALL_AGENTS[agentId];
    if (!def) {
      throw new Error(`Unknown agent ID: ${agentId}`);
    }
    return def;
  }

  /**
   * List all available agent definitions.
   */
  static listDefinitions(): AgentDefinition[] {
    return Object.values(ALL_AGENTS);
  }

  /**
   * List default-enabled agent IDs (as configured in the Bootstrap Wizard).
   */
  static getDefaultEnabledAgents(): AgentId[] {
    return (Object.values(ALL_AGENTS) as AgentDefinition[])
      .filter((d) => d.defaultEnabled)
      .map((d) => d.id as AgentId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getDefinition(agentId: AgentId): AgentDefinition {
    return AgentLifecycleManager.getDefinition(agentId);
  }

  private assertInstanceExists(instanceId: string): void {
    if (!this.instances.has(instanceId)) {
      throw new Error(`Agent instance not found: ${instanceId}`);
    }
  }

  /** Expose gateway client for testing */
  get _gatewayClient(): OpenClawGatewayClient {
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Create an AgentLifecycleManager with sensible defaults for the given
 * gateway configuration. Convenience wrapper for common bootstrap patterns.
 *
 * @example
 * ```ts
 * const manager = createLifecycleManager(
 *   { gatewayUrl: 'ws://openclaw:18789' },
 *   'ecommerce',
 *   { business_name: 'My Shop' },
 * );
 * ```
 */
export function createLifecycleManager(
  gateway: OpenClawGatewayOptions,
  businessTemplate?: AgentLifecycleManagerOptions['businessTemplate'],
  defaultPromptVariables?: Record<string, string>,
): AgentLifecycleManager {
  return new AgentLifecycleManager({
    gateway,
    businessTemplate,
    defaultPromptVariables,
  });
}
