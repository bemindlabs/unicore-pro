/**
 * @unicore/agents-pro — OpenClaw Gateway client
 *
 * Handles WebSocket connection to the OpenClaw Gateway and exposes
 * agent spawning and management primitives.
 *
 * OpenClaw Gateway runs at ws://localhost:18789 by default.
 */

import type {
  AgentDefinition,
  AgentInstance,
  SpawnOptions,
  OpenClawGatewayOptions,
  BusinessTemplate,
  AgentStatus,
} from './types';
import { interpolatePrompt } from './prompts';

const DEFAULT_GATEWAY_URL = 'ws://localhost:18789';
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Payload sent to the gateway to spawn a new agent instance.
 * Shape mirrors the OpenClaw Gateway WebSocket protocol.
 */
interface SpawnPayload {
  type: 'spawn';
  agentType: string;
  systemPrompt: string;
  tools: AgentDefinition['tools'];
  autonomy: string;
  channels: string[];
  workingHours: SpawnOptions['workingHours'] | null;
  llmProvider: string;
  metadata: Record<string, unknown>;
}

/**
 * Generic message received from the gateway.
 */
interface GatewayMessage {
  type: string;
  instanceId?: string;
  status?: AgentStatus;
  error?: string;
  [key: string]: unknown;
}

/**
 * Low-level WebSocket-based client for the OpenClaw Gateway.
 *
 * Used internally by AgentLifecycleManager. Can also be used directly
 * for advanced use cases.
 */
export class OpenClawGatewayClient {
  private readonly gatewayUrl: string;
  private readonly authToken: string | undefined;
  private readonly connectTimeoutMs: number;

  /**
   * Pending response handlers keyed by a correlation ID.
   * In a real implementation this would use the WebSocket connection;
   * for now it is a synchronous simulation interface used by tests.
   */
  private readonly pendingHandlers = new Map<
    string,
    (msg: GatewayMessage) => void
  >();

  /**
   * Injectable transport factory — defaults to native WebSocket.
   * Tests can override this to provide a mock transport.
   */
  private readonly _createWebSocket: (url: string) => WebSocket;

  constructor(
    options: OpenClawGatewayOptions = {},
    createWebSocket?: (url: string) => WebSocket,
  ) {
    this.gatewayUrl = options.gatewayUrl ?? DEFAULT_GATEWAY_URL;
    this.authToken = options.authToken;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this._createWebSocket = createWebSocket ?? ((url) => new (globalThis as unknown as { WebSocket: new (u: string) => WebSocket }).WebSocket(url));
  }

  /**
   * Send a spawn command to the gateway and resolve with the assigned instanceId.
   */
  async spawn(payload: SpawnPayload): Promise<string> {
    return this.sendCommand<{ instanceId: string }>('spawn', payload).then(
      (r) => r.instanceId,
    );
  }

  /**
   * Send a lifecycle command (stop / restart / status) for an instance.
   */
  async sendLifecycleCommand(
    command: 'stop' | 'restart' | 'status',
    instanceId: string,
  ): Promise<GatewayMessage> {
    return this.sendCommand<GatewayMessage>(command, { instanceId });
  }

  /**
   * Send an arbitrary command to the gateway and wait for the response.
   *
   * NOTE: In production this opens a WebSocket, sends the JSON payload,
   * waits for a message with matching correlationId, then closes the
   * connection (or reuses a pool). The current implementation is a
   * simulation that resolves via the pendingHandlers map so tests can
   * inject responses without a live gateway.
   */
  private sendCommand<T>(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const correlationId = generateCorrelationId();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHandlers.delete(correlationId);
        reject(new Error(`OpenClaw Gateway timeout waiting for '${command}' response`));
      }, this.connectTimeoutMs);

      this.pendingHandlers.set(correlationId, (msg: GatewayMessage) => {
        clearTimeout(timer);
        this.pendingHandlers.delete(correlationId);

        if (msg.error) {
          reject(new Error(`OpenClaw Gateway error: ${msg.error}`));
        } else {
          resolve(msg as unknown as T);
        }
      });

      // Emit the command — in a real implementation this goes over WS.
      // We expose the emit for testing via _simulateResponse.
      void this._dispatchCommand(command, correlationId, payload).catch(
        (err: unknown) => {
          clearTimeout(timer);
          this.pendingHandlers.delete(correlationId);
          reject(err);
        },
      );
    });
  }

  /**
   * Dispatches the command payload to the gateway transport.
   * In test mode callers use _simulateResponse to trigger resolution.
   */
  private async _dispatchCommand(
    command: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const message = JSON.stringify({
      correlationId,
      command,
      authToken: this.authToken,
      ...payload,
    });

    // In environments where WebSocket is available, open a connection,
    // send, listen for the correlated response, and resolve.
    // When WebSocket is not available (e.g. Node.js test without a mock),
    // the pending handler will time out — callers should inject a mock
    // transport via the constructor parameter.
    try {
      const ws = this._createWebSocket(this.gatewayUrl);
      const self = this;

      ws.onopen = () => {
        ws.send(message);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const response = JSON.parse(String(event.data)) as GatewayMessage & {
            correlationId?: string;
          };
          if (response.correlationId === correlationId) {
            const handler = self.pendingHandlers.get(correlationId);
            if (handler) handler(response);
            ws.close();
          }
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onerror = (err: Event) => {
        const handler = self.pendingHandlers.get(correlationId);
        if (handler) {
          handler({ type: 'error', error: `WebSocket error: ${String(err)}` });
        }
      };
    } catch {
      // WebSocket not available in this environment — test must call _simulateResponse
    }
  }

  /**
   * Test helper: simulate a gateway response for a pending correlationId.
   * @internal
   */
  _simulateResponse(correlationId: string, response: GatewayMessage): void {
    const handler = this.pendingHandlers.get(correlationId);
    if (handler) handler(response);
  }

  /**
   * Test helper: resolve all pending commands with a given response.
   * @internal
   */
  _resolveAll(response: GatewayMessage): void {
    for (const handler of this.pendingHandlers.values()) {
      handler(response);
    }
    this.pendingHandlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateCorrelationId(): string {
  return `uc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build the resolved system prompt for an agent instance.
 *
 * Selects the template-specific prompt variant if available, then
 * interpolates all provided variables.
 */
export function resolveSystemPrompt(
  definition: AgentDefinition,
  options: SpawnOptions,
): string {
  const template = options.businessTemplate as BusinessTemplate | undefined;
  const basePrompt =
    (template && definition.templatePrompts[template]) ?? definition.systemPrompt;

  const variables: Record<string, string> = {
    business_name: 'My Business',
    template: template ?? 'custom',
    large_expense_threshold: '10000',
    ...options.promptVariables,
  };

  return interpolatePrompt(basePrompt, variables);
}

/**
 * Build the SpawnPayload for the gateway from an AgentDefinition and SpawnOptions.
 */
export function buildSpawnPayload(
  definition: AgentDefinition,
  options: SpawnOptions,
): SpawnPayload {
  return {
    type: 'spawn',
    agentType: definition.openClawType,
    systemPrompt: resolveSystemPrompt(definition, options),
    tools: definition.tools,
    autonomy: options.autonomy ?? definition.defaultAutonomy,
    channels: options.channels ?? [],
    workingHours: options.workingHours ?? null,
    llmProvider: options.llmProvider ?? 'anthropic',
    metadata: {
      agentId: definition.id,
      agentName: definition.name,
      businessTemplate: options.businessTemplate ?? 'custom',
    },
  };
}

/**
 * Build a placeholder AgentInstance (before the gateway assigns an instanceId).
 */
export function buildAgentInstance(
  definition: AgentDefinition,
  options: SpawnOptions,
  instanceId: string,
): AgentInstance {
  return {
    instanceId,
    definition,
    status: 'running',
    startedAt: new Date().toISOString(),
    autonomy: options.autonomy ?? definition.defaultAutonomy,
    channels: options.channels ?? [],
    workingHours: options.workingHours ?? null,
    llmProvider: options.llmProvider ?? 'anthropic',
    lastError: null,
  };
}
