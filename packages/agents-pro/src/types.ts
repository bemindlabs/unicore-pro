/**
 * @unicore/agents-pro — Core type definitions
 *
 * Agent definition interface, lifecycle types, and business template
 * variant types used throughout the pro specialist agent layer.
 */

// ---------------------------------------------------------------------------
// Business templates
// ---------------------------------------------------------------------------

export type BusinessTemplate =
  | 'ecommerce'
  | 'freelance'
  | 'agency'
  | 'content_creator'
  | 'saas'
  | 'retail'
  | 'professional_services'
  | 'custom';

// ---------------------------------------------------------------------------
// Agent identifiers
// ---------------------------------------------------------------------------

export type AgentId =
  | 'comms'
  | 'finance'
  | 'growth'
  | 'ops'
  | 'research'
  | 'erp'
  | 'builder';

// ---------------------------------------------------------------------------
// Tool / capability descriptors
// ---------------------------------------------------------------------------

export interface AgentTool {
  /** Machine-readable tool identifier, e.g. "send_email" */
  name: string;
  /** Human-readable description shown in the UI */
  description: string;
  /**
   * JSON Schema (draft-07) describing the tool's input parameters.
   * Sent to the LLM as the function/tool schema.
   */
  inputSchema: Record<string, unknown>;
}

export type AgentCapability =
  | 'email'
  | 'sms'
  | 'push_notification'
  | 'social_media'
  | 'line'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'whatsapp'
  | 'facebook_messenger'
  | 'instagram_dm'
  | 'web_chat'
  | 'crm_read'
  | 'crm_write'
  | 'orders_read'
  | 'orders_write'
  | 'inventory_read'
  | 'inventory_write'
  | 'invoicing_read'
  | 'invoicing_write'
  | 'expenses_read'
  | 'expenses_write'
  | 'reports_read'
  | 'web_search'
  | 'rag_read'
  | 'rag_write'
  | 'code_execution'
  | 'deployment'
  | 'kafka_publish'
  | 'workflow_trigger';

// ---------------------------------------------------------------------------
// Autonomy and scheduling
// ---------------------------------------------------------------------------

export type AutonomyLevel = 'full_auto' | 'approval' | 'suggest';

export interface WorkingHours {
  /** HH:MM in 24-hour format */
  start: string;
  /** HH:MM in 24-hour format */
  end: string;
  /** ISO weekday numbers 1=Monday … 7=Sunday. Default: [1,2,3,4,5] */
  days?: number[];
  /** IANA timezone string. Default: inherited from business profile */
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Core agent definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  /** Stable machine identifier */
  id: AgentId;
  /** Display name shown in the UI */
  name: string;
  /** One-sentence description shown in the wizard and settings */
  description: string;
  /**
   * Default system prompt injected into every LLM call for this agent.
   * May include {{business_name}} and {{template}} interpolation tokens.
   */
  systemPrompt: string;
  /** Tools the agent can invoke */
  tools: AgentTool[];
  /** High-level capabilities that determine which integrations are requested */
  capabilities: AgentCapability[];
  /**
   * Industry-specific system prompt overrides keyed by BusinessTemplate.
   * When a template match is found, `systemPrompt` is replaced by this value
   * before spawning the agent.
   */
  templatePrompts: Partial<Record<BusinessTemplate, string>>;
  /** Default autonomy level — can be overridden per deployment */
  defaultAutonomy: AutonomyLevel;
  /** Whether the agent is enabled by default in the Bootstrap Wizard */
  defaultEnabled: boolean;
  /** UI icon (emoji) */
  icon: string;
  /** OpenClaw agent type identifier */
  openClawType: string;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type AgentStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface AgentInstance {
  /** Unique instance ID assigned by the OpenClaw Gateway */
  instanceId: string;
  /** Definition this instance was spawned from */
  definition: AgentDefinition;
  /** Current operational status */
  status: AgentStatus;
  /** ISO timestamp when this instance was started */
  startedAt: string | null;
  /** Active autonomy level for this instance */
  autonomy: AutonomyLevel;
  /** Active channel bindings */
  channels: string[];
  /** Active working hours (if restricted) */
  workingHours: WorkingHours | null;
  /** LLM provider selected for this instance */
  llmProvider: string;
  /** Last error message if status === 'error' */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Spawn options
// ---------------------------------------------------------------------------

export interface SpawnOptions {
  /** Override autonomy level for this instance */
  autonomy?: AutonomyLevel;
  /** Communication channel identifiers to bind */
  channels?: string[];
  /** Restrict active hours */
  workingHours?: WorkingHours;
  /** LLM provider override. Default: 'anthropic' */
  llmProvider?: string;
  /** Business template used to select the appropriate prompt variant */
  businessTemplate?: BusinessTemplate;
  /** Extra variables interpolated into the system prompt */
  promptVariables?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// OpenClaw Gateway connection options
// ---------------------------------------------------------------------------

export interface OpenClawGatewayOptions {
  /** WebSocket URL of the OpenClaw Gateway. Default: ws://localhost:18789 */
  gatewayUrl?: string;
  /** Authentication token */
  authToken?: string;
  /** Connection timeout in ms. Default: 10_000 */
  connectTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Lifecycle manager options
// ---------------------------------------------------------------------------

export interface AgentLifecycleManagerOptions {
  gateway: OpenClawGatewayOptions;
  /** Business template applied to all spawned agents */
  businessTemplate?: BusinessTemplate;
  /** Default prompt variables merged with instance-level overrides */
  defaultPromptVariables?: Record<string, string>;
}
