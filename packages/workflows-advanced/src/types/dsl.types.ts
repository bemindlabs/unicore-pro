/**
 * Workflow DSL Types
 * JSON/YAML workflow definition with branching, loops, and parallel execution.
 */

// ---------------------------------------------------------------------------
// Primitive value types used inside expressions and conditions
// ---------------------------------------------------------------------------

export type PrimitiveValue = string | number | boolean | null;

export type ContextValue = PrimitiveValue | Record<string, unknown> | unknown[];

// ---------------------------------------------------------------------------
// Condition expression (supports nested AND/OR)
// ---------------------------------------------------------------------------

export type ComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null';

export interface LeafCondition {
  type: 'leaf';
  /** JSONPath-like reference into workflow context, e.g. "$.lead.score" */
  field: string;
  operator: ComparisonOperator;
  value?: ContextValue;
}

export interface CompositeCondition {
  type: 'and' | 'or';
  conditions: Condition[];
}

export interface NotCondition {
  type: 'not';
  condition: Condition;
}

export type Condition = LeafCondition | CompositeCondition | NotCondition;

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs: number;
  /** Backoff multiplier (1 = linear, 2 = exponential) */
  backoffMultiplier: number;
  maxDelayMs: number;
  /** Error codes / messages that are retryable */
  retryOn?: string[];
}

// ---------------------------------------------------------------------------
// Timeout configuration
// ---------------------------------------------------------------------------

export interface TimeoutConfig {
  /** Milliseconds before the node is considered timed-out */
  durationMs: number;
  /** Node ID to jump to on timeout (defaults to end node) */
  onTimeoutGoTo?: string;
}

// ---------------------------------------------------------------------------
// Action configuration
// ---------------------------------------------------------------------------

export type ActionType =
  | 'http_request'
  | 'send_email'
  | 'send_sms'
  | 'send_notification'
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'run_agent'
  | 'transform_data'
  | 'wait'
  | 'webhook'
  | 'script';

export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** Template string with {{variable}} interpolation */
  body?: string;
  /** JSONPath to extract result into context variable */
  outputMapping?: Record<string, string>;
}

export interface SendEmailConfig {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  /** Handlebars template */
  bodyTemplate: string;
  attachments?: Array<{ name: string; url: string }>;
}

export interface SendSmsConfig {
  to: string;
  bodyTemplate: string;
  provider?: string;
}

export interface SendNotificationConfig {
  channel: 'in_app' | 'push' | 'slack' | 'teams';
  title: string;
  messageTemplate: string;
  targetUserIds?: string[];
}

export interface RecordConfig {
  model: string;
  data: Record<string, unknown>;
  idField?: string;
}

export interface RunAgentConfig {
  agentId: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  waitForCompletion: boolean;
}

export interface TransformDataConfig {
  /** JSONata or simple mapping expressions */
  expression: string;
  outputVariable: string;
}

export interface WaitConfig {
  /** Milliseconds to wait */
  durationMs?: number;
  /** ISO 8601 datetime string (supports template expressions) */
  until?: string;
}

export interface ScriptConfig {
  /** Inline JavaScript (sandboxed) */
  code: string;
  outputVariable?: string;
}

export type ActionConfig =
  | ({ actionType: 'http_request' } & HttpRequestConfig)
  | ({ actionType: 'send_email' } & SendEmailConfig)
  | ({ actionType: 'send_sms' } & SendSmsConfig)
  | ({ actionType: 'send_notification' } & SendNotificationConfig)
  | ({ actionType: 'create_record' } & RecordConfig)
  | ({ actionType: 'update_record' } & RecordConfig)
  | ({ actionType: 'delete_record' } & RecordConfig)
  | ({ actionType: 'run_agent' } & RunAgentConfig)
  | ({ actionType: 'transform_data' } & TransformDataConfig)
  | ({ actionType: 'wait' } & WaitConfig)
  | ({ actionType: 'script' } & ScriptConfig);

// ---------------------------------------------------------------------------
// Trigger configuration
// ---------------------------------------------------------------------------

export type TriggerType =
  | 'manual'
  | 'schedule'
  | 'event'
  | 'webhook'
  | 'record_created'
  | 'record_updated'
  | 'record_deleted'
  | 'api';

export interface ScheduleTriggerConfig {
  /** Cron expression */
  cron: string;
  timezone?: string;
}

export interface EventTriggerConfig {
  eventName: string;
  filter?: Condition;
}

export interface WebhookTriggerConfig {
  /** Relative path, e.g. /webhooks/my-workflow */
  path: string;
  secret?: string;
  method?: 'GET' | 'POST' | 'PUT';
}

export interface RecordTriggerConfig {
  model: string;
  filter?: Condition;
}

export type TriggerConfig =
  | { triggerType: 'manual' }
  | { triggerType: 'api' }
  | ({ triggerType: 'schedule' } & ScheduleTriggerConfig)
  | ({ triggerType: 'event' } & EventTriggerConfig)
  | ({ triggerType: 'webhook' } & WebhookTriggerConfig)
  | ({ triggerType: 'record_created' } & RecordTriggerConfig)
  | ({ triggerType: 'record_updated' } & RecordTriggerConfig)
  | ({ triggerType: 'record_deleted' } & RecordTriggerConfig);

// ---------------------------------------------------------------------------
// Loop configuration
// ---------------------------------------------------------------------------

export interface ForEachLoopConfig {
  loopType: 'for_each';
  /** JSONPath to iterable in context */
  collection: string;
  /** Variable name for current item inside loop body */
  itemVariable: string;
  /** Variable name for current index */
  indexVariable?: string;
  /** Max concurrent iterations (1 = sequential) */
  concurrency?: number;
}

export interface WhileLoopConfig {
  loopType: 'while';
  condition: Condition;
  /** Safety limit to prevent infinite loops */
  maxIterations?: number;
}

export interface CountLoopConfig {
  loopType: 'count';
  count: number | string;
  indexVariable?: string;
}

export type LoopConfig = ForEachLoopConfig | WhileLoopConfig | CountLoopConfig;

// ---------------------------------------------------------------------------
// Parallel execution configuration
// ---------------------------------------------------------------------------

export interface ParallelConfig {
  /** 'all' waits for all branches, 'any' continues when first completes */
  waitStrategy: 'all' | 'any' | 'n_of_m';
  /** For 'n_of_m' strategy */
  minRequired?: number;
  /** Max concurrent branch executions */
  maxConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Branch (conditional routing)
// ---------------------------------------------------------------------------

export interface ConditionalBranch {
  /** Human-readable label */
  label?: string;
  condition: Condition;
  /** Next node ID */
  nextNodeId: string;
}

export interface ConditionNodeConfig {
  branches: ConditionalBranch[];
  /** Fallback node if no branch matches */
  defaultNextNodeId?: string;
}

// ---------------------------------------------------------------------------
// Node base + specialised node types
// ---------------------------------------------------------------------------

export type WorkflowNodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'end';

interface BaseNode {
  /** Unique node identifier within the workflow */
  id: string;
  /** Human-readable name */
  name: string;
  description?: string;
  /** Tags for grouping / searching */
  tags?: string[];
  retryPolicy?: RetryPolicy;
  timeout?: TimeoutConfig;
  /** Context variable to store the node output result */
  outputVariable?: string;
  /** Arbitrary metadata (for UI positioning, notes, etc.) */
  metadata?: Record<string, unknown>;
}

export interface TriggerNode extends BaseNode {
  type: 'trigger';
  triggerConfig: TriggerConfig;
  /** ID of the first node to execute */
  nextNodeId: string;
}

export interface ActionNode extends BaseNode {
  type: 'action';
  actionConfig: ActionConfig;
  /** Next node ID on success */
  nextNodeId?: string;
  /** Next node ID on failure (if not retrying) */
  onErrorNodeId?: string;
}

export interface ConditionNode extends BaseNode {
  type: 'condition';
  conditionConfig: ConditionNodeConfig;
}

export interface LoopNode extends BaseNode {
  type: 'loop';
  loopConfig: LoopConfig;
  /** Entry node of the loop body */
  bodyNodeId: string;
  /** Next node after the loop completes */
  nextNodeId?: string;
}

/** A parallel node forks execution into multiple named branches */
export interface ParallelBranchDef {
  id: string;
  name: string;
  /** Entry node of this branch */
  entryNodeId: string;
}

export interface ParallelNode extends BaseNode {
  type: 'parallel';
  parallelConfig: ParallelConfig;
  branches: ParallelBranchDef[];
  /** Node to run after all (or required) branches complete */
  nextNodeId?: string;
}

export interface EndNode extends BaseNode {
  type: 'end';
  /** Outcome label: 'success' | 'failure' | 'cancelled' | custom string */
  outcome?: string;
  /** Final output to surface as the workflow result */
  outputMapping?: Record<string, string>;
}

export type WorkflowNode =
  | TriggerNode
  | ActionNode
  | ConditionNode
  | LoopNode
  | ParallelNode
  | EndNode;

// ---------------------------------------------------------------------------
// Top-level Workflow Definition
// ---------------------------------------------------------------------------

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: ContextValue;
  required?: boolean;
  description?: string;
}

export interface WorkflowDefinition {
  /** Semantic version, e.g. "1.0.0" */
  schemaVersion: string;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  status: WorkflowStatus;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  /** Entry point — must be a trigger node id */
  entryNodeId: string;
  /** All nodes keyed by their id */
  nodes: Record<string, WorkflowNode>;
  /** Input variables for the workflow */
  inputSchema?: WorkflowVariable[];
  /** Output variables surfaced to callers */
  outputSchema?: WorkflowVariable[];
  /** Global settings */
  settings?: {
    /** Overall execution timeout in ms */
    timeoutMs?: number;
    /** Max number of concurrent executions of this workflow */
    maxConcurrentExecutions?: number;
    /** Whether to persist execution history */
    persistHistory?: boolean;
    /** Timezone for schedule triggers */
    timezone?: string;
  };
}
