/**
 * Workflow Execution Types
 * Runtime state, events, and execution records.
 */

import type { ContextValue, WorkflowDefinition, WorkflowNode } from './dsl.types.js';

// ---------------------------------------------------------------------------
// Execution context — the mutable data bag passed between nodes
// ---------------------------------------------------------------------------

export type WorkflowContext = Record<string, ContextValue>;

// ---------------------------------------------------------------------------
// Node execution status
// ---------------------------------------------------------------------------

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'timed_out'
  | 'retrying';

export interface NodeExecutionRecord {
  nodeId: string;
  nodeName: string;
  nodeType: WorkflowNode['type'];
  status: NodeExecutionStatus;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  input?: WorkflowContext;
  output?: WorkflowContext;
  error?: ExecutionError;
}

// ---------------------------------------------------------------------------
// Overall workflow execution status
// ---------------------------------------------------------------------------

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'paused';

export interface ExecutionError {
  code: string;
  message: string;
  nodeId?: string;
  stack?: string;
  retryable?: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: WorkflowExecutionStatus;
  /** ISO 8601 */
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  /** Trigger that started the execution */
  trigger: {
    type: string;
    payload?: WorkflowContext;
  };
  /** Current node being executed */
  currentNodeId?: string;
  /** Mutable execution context */
  context: WorkflowContext;
  /** Ordered log of node executions */
  nodeHistory: NodeExecutionRecord[];
  /** Final workflow output */
  output?: WorkflowContext;
  error?: ExecutionError;
  /** Metadata provided by caller */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execution options
// ---------------------------------------------------------------------------

export interface ExecutionOptions {
  /** If provided, resumes from this node (used for retries / paused executions) */
  resumeFromNodeId?: string;
  /** Initial context to seed before running */
  initialContext?: WorkflowContext;
  /** Timeout override in ms */
  timeoutMs?: number;
  /** Dry-run: validate + simulate without side effects */
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execution events emitted during a run
// ---------------------------------------------------------------------------

export type ExecutionEventType =
  | 'execution.started'
  | 'execution.completed'
  | 'execution.failed'
  | 'execution.cancelled'
  | 'execution.paused'
  | 'node.started'
  | 'node.completed'
  | 'node.failed'
  | 'node.retrying'
  | 'node.timed_out'
  | 'node.skipped'
  | 'loop.iteration_started'
  | 'loop.iteration_completed'
  | 'parallel.branch_started'
  | 'parallel.branch_completed'
  | 'parallel.all_completed';

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  workflowId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type ExecutionEventHandler = (event: ExecutionEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// State persistence interface (to be implemented by adapters)
// ---------------------------------------------------------------------------

export interface StatePersistenceAdapter {
  /** Persist a new execution record */
  saveExecution(execution: WorkflowExecution): Promise<void>;
  /** Update an existing execution */
  updateExecution(
    executionId: string,
    patch: Partial<WorkflowExecution>,
  ): Promise<void>;
  /** Load an execution by id */
  getExecution(executionId: string): Promise<WorkflowExecution | null>;
  /** List executions for a workflow */
  listExecutions(
    workflowId: string,
    options?: {
      status?: WorkflowExecutionStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowExecution[]>;
  /** Delete execution history older than the given date */
  purgeHistory(workflowId: string, before: Date): Promise<number>;
  /** Append a node execution record */
  appendNodeRecord(
    executionId: string,
    record: NodeExecutionRecord,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Workflow registry interface
// ---------------------------------------------------------------------------

export interface WorkflowRegistryAdapter {
  getWorkflow(workflowId: string): Promise<WorkflowDefinition | null>;
  saveWorkflow(workflow: WorkflowDefinition): Promise<void>;
  listWorkflows(options?: {
    status?: WorkflowDefinition['status'];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<WorkflowDefinition[]>;
  deleteWorkflow(workflowId: string): Promise<void>;
}
