/**
 * WorkflowEngine — the main execution orchestrator.
 *
 * Responsibilities:
 *   - Accept a WorkflowDefinition and run it to completion
 *   - Manage execution lifecycle (start, pause, resume, cancel)
 *   - Emit events at each lifecycle transition
 *   - Persist state through StatePersistenceAdapter
 *   - Apply retry policies and timeouts
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowDefinition,
  WorkflowNode,
  ActionNode,
  WorkflowContext,
  WorkflowExecution,
  NodeExecutionRecord,
  ExecutionOptions,
  ExecutionEvent,
  ExecutionEventHandler,
  StatePersistenceAdapter,
  ExecutionError,
} from '../types/index.js';
import { NodeExecutor, type ActionHandler } from './node.executor.js';
import { mergeContext } from './context.js';

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export interface WorkflowEngineConfig {
  persistence?: StatePersistenceAdapter;
  /** Default retry policy for all nodes (can be overridden per-node) */
  defaultRetryPolicy?: {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
  };
}

export class WorkflowEngine {
  private readonly nodeExecutor: NodeExecutor;
  private readonly persistence?: StatePersistenceAdapter;
  private readonly eventHandlers: ExecutionEventHandler[] = [];
  private readonly config: WorkflowEngineConfig;

  constructor(config: WorkflowEngineConfig = {}) {
    this.config = config;
    this.persistence = config.persistence;
    this.nodeExecutor = new NodeExecutor();
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerActionHandler(handler: ActionHandler): this {
    this.nodeExecutor.registerActionHandler(handler);
    return this;
  }

  onEvent(handler: ExecutionEventHandler): this {
    this.eventHandlers.push(handler);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Execute a workflow
  // ---------------------------------------------------------------------------

  async execute(
    definition: WorkflowDefinition,
    options: ExecutionOptions = {},
  ): Promise<WorkflowExecution> {
    const executionId = uuidv4();
    const now = new Date().toISOString();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: definition.id,
      workflowVersion: definition.schemaVersion,
      status: 'running',
      startedAt: now,
      trigger: {
        type: options.initialContext?.['_triggerType'] as string ?? 'manual',
        payload: options.initialContext,
      },
      context: options.initialContext ?? {},
      nodeHistory: [],
      metadata: options.metadata,
    };

    await this.persistExecution(execution);
    await this.emit({ type: 'execution.started', executionId, workflowId: definition.id, timestamp: now });

    // Apply global timeout
    const timeoutMs =
      options.timeoutMs ?? definition.settings?.timeoutMs;

    try {
      let finalContext = execution.context;

      if (timeoutMs) {
        finalContext = await Promise.race([
          this.runWorkflow(definition, execution, options),
          this.createTimeout(timeoutMs, executionId),
        ]);
      } else {
        finalContext = await this.runWorkflow(definition, execution, options);
      }

      const completedAt = new Date().toISOString();
      const patch: Partial<WorkflowExecution> = {
        status: 'succeeded',
        completedAt,
        durationMs: Date.now() - new Date(execution.startedAt).getTime(),
        context: finalContext,
        output: finalContext,
      };

      Object.assign(execution, patch);
      await this.persistExecution(execution);
      await this.emit({
        type: 'execution.completed',
        executionId,
        workflowId: definition.id,
        timestamp: completedAt,
      });
    } catch (err: unknown) {
      const error = normalizeError(err, execution.currentNodeId);
      const failedAt = new Date().toISOString();

      const isTimeout = error.code === 'EXECUTION_TIMEOUT';

      const patch: Partial<WorkflowExecution> = {
        status: isTimeout ? 'timed_out' : 'failed',
        completedAt: failedAt,
        durationMs: Date.now() - new Date(execution.startedAt).getTime(),
        error,
      };

      Object.assign(execution, patch);
      await this.persistExecution(execution);
      await this.emit({
        type: isTimeout ? 'execution.failed' : 'execution.failed',
        executionId,
        workflowId: definition.id,
        timestamp: failedAt,
        payload: { error },
      });
    }

    return execution;
  }

  // ---------------------------------------------------------------------------
  // Core execution loop
  // ---------------------------------------------------------------------------

  private async runWorkflow(
    definition: WorkflowDefinition,
    execution: WorkflowExecution,
    options: ExecutionOptions,
  ): Promise<WorkflowContext> {
    let currentNodeId: string | undefined =
      options.resumeFromNodeId ?? definition.entryNodeId;

    let currentContext = { ...execution.context };

    while (currentNodeId) {
      const node = definition.nodes[currentNodeId];
      if (!node) {
        throw new Error(`Node "${currentNodeId}" not found in workflow definition`);
      }

      execution.currentNodeId = currentNodeId;
      const nodeRecord = await this.runNodeWithRetries(
        node,
        currentContext,
        definition,
        options.dryRun ?? false,
        execution,
      );

      execution.nodeHistory.push(nodeRecord);
      await this.persistNodeRecord(execution.id, nodeRecord);

      if (nodeRecord.status === 'failed' || nodeRecord.status === 'timed_out') {
        throw new Error(nodeRecord.error?.message ?? `Node "${currentNodeId}" failed`);
      }

      // Merge output into context (exclude internal routing keys)
      if (nodeRecord.output) {
        const { _nextNodeId: _ignored, ...contextOutput } = nodeRecord.output;
        currentContext = mergeContext(currentContext, contextOutput);
      }

      // Find next node
      currentNodeId = this.resolveNextNode(nodeRecord, node);
    }

    return currentContext;
  }

  // ---------------------------------------------------------------------------
  // Run a single node with retry policy
  // ---------------------------------------------------------------------------

  private async runNodeWithRetries(
    node: WorkflowNode,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    dryRun: boolean,
    execution: WorkflowExecution,
  ): Promise<NodeExecutionRecord> {
    const retryPolicy = node.retryPolicy ?? this.config.defaultRetryPolicy;
    const maxAttempts = retryPolicy?.maxAttempts ?? 1;
    const startedAt = new Date().toISOString();

    let attempt = 0;
    let lastError: ExecutionError | undefined;

    while (attempt < maxAttempts) {
      attempt++;
      const attemptStart = Date.now();

      if (attempt > 1) {
        await this.emit({
          type: 'node.retrying',
          executionId: execution.id,
          workflowId: definition.id,
          timestamp: new Date().toISOString(),
          payload: { nodeId: node.id, attempt },
        });

        // Exponential backoff
        const delay = Math.min(
          (retryPolicy!.initialDelayMs ?? 1000) *
            Math.pow(retryPolicy!.backoffMultiplier ?? 2, attempt - 2),
          retryPolicy!.maxDelayMs ?? 30_000,
        );
        await sleep(delay);
      }

      await this.emit({
        type: 'node.started',
        executionId: execution.id,
        workflowId: definition.id,
        timestamp: new Date().toISOString(),
        payload: { nodeId: node.id, attempt },
      });

      try {
        let result: { nextNodeId?: string; contextPatch: WorkflowContext };

        if (node.timeout) {
          result = await Promise.race([
            this.nodeExecutor.executeNode(node, context, definition, dryRun),
            this.createNodeTimeout(node.timeout.durationMs),
          ]);
        } else {
          result = await this.nodeExecutor.executeNode(node, context, definition, dryRun);
        }

        const durationMs = Date.now() - attemptStart;
        const record: NodeExecutionRecord = {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'succeeded',
          attempt,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          input: context,
          output: result.nextNodeId
            ? { ...result.contextPatch, _nextNodeId: result.nextNodeId }
            : result.contextPatch,
        };

        await this.emit({
          type: 'node.completed',
          executionId: execution.id,
          workflowId: definition.id,
          timestamp: record.completedAt!,
          payload: { nodeId: node.id, durationMs },
        });

        return record;
      } catch (err: unknown) {
        const error = normalizeError(err, node.id);
        lastError = error;

        if (attempt >= maxAttempts) {
          const durationMs = Date.now() - attemptStart;
          const record: NodeExecutionRecord = {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            status: error.code === 'NODE_TIMEOUT' ? 'timed_out' : 'failed',
            attempt,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs,
            input: context,
            error,
          };

          await this.emit({
            type: 'node.failed',
            executionId: execution.id,
            workflowId: definition.id,
            timestamp: record.completedAt!,
            payload: { nodeId: node.id, error },
          });

          // If node has onErrorNodeId, treat as success (error routing)
          if (node.type === 'action' && (node as ActionNode).onErrorNodeId) {
            record.status = 'failed';
            record.output = { _errorNodeId: (node as ActionNode).onErrorNodeId as string };
            return record;
          }

          return record;
        }
      }
    }

    // Should not reach here
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'failed',
      attempt,
      startedAt,
      completedAt: new Date().toISOString(),
      error: lastError,
    };
  }

  // ---------------------------------------------------------------------------
  // Resolve next node from execution record
  // ---------------------------------------------------------------------------

  private resolveNextNode(
    record: NodeExecutionRecord,
    node: WorkflowNode,
  ): string | undefined {
    // Error routing
    if (
      record.status === 'failed' &&
      node.type === 'action' &&
      (node as ActionNode).onErrorNodeId
    ) {
      return (node as ActionNode).onErrorNodeId;
    }

    if (record.status !== 'succeeded') return undefined;

    // Next node is embedded in output for condition/routing nodes
    if (record.output?.['_nextNodeId']) {
      return record.output['_nextNodeId'] as string;
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Timeout helpers
  // ---------------------------------------------------------------------------

  private createTimeout(ms: number, executionId: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => {
        reject(
          Object.assign(new Error(`Execution "${executionId}" timed out after ${ms}ms`), {
            code: 'EXECUTION_TIMEOUT',
          }),
        );
      }, ms),
    );
  }

  private createNodeTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => {
        reject(
          Object.assign(new Error(`Node timed out after ${ms}ms`), {
            code: 'NODE_TIMEOUT',
          }),
        );
      }, ms),
    );
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private async persistExecution(execution: WorkflowExecution): Promise<void> {
    if (!this.persistence) return;
    try {
      await this.persistence.saveExecution(execution);
    } catch {
      // Non-fatal — log in production
    }
  }

  private async persistNodeRecord(
    executionId: string,
    record: NodeExecutionRecord,
  ): Promise<void> {
    if (!this.persistence) return;
    try {
      await this.persistence.appendNodeRecord(executionId, record);
    } catch {
      // Non-fatal
    }
  }

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  private async emit(event: ExecutionEvent): Promise<void> {
    await Promise.all(
      this.eventHandlers.map((handler) =>
        Promise.resolve(handler(event)).catch((err: unknown) => {
          console.error('[WorkflowEngine] Event handler error:', err);
        }),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(err: unknown, nodeId?: string): ExecutionError {
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code ?? 'EXECUTION_ERROR';
    return {
      code,
      message: err.message,
      nodeId,
      stack: err.stack,
      retryable: code !== 'EXECUTION_TIMEOUT' && code !== 'NODE_TIMEOUT',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(err),
    nodeId,
    retryable: true,
  };
}
