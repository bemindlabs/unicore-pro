/**
 * Core types for the custom agent creation system.
 * Covers agent definition, versioning, tool registry, wizard steps,
 * and simulator conversations.
 */

// ─── Agent Model ────────────────────────────────────────────────────────────

export type AgentStatus = 'draft' | 'active' | 'archived' | 'testing';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'custom';

/** Runtime configuration for an agent's LLM call. */
export interface AgentModelConfig {
  provider: ModelProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

/** A registered tool that can be attached to a custom agent. */
export interface AgentTool {
  id: string;
  name: string;
  description: string;
  /** JSON-Schema-compatible parameter definition. */
  parameters: Record<string, unknown>;
  /** Whether this tool is available in the current license tier. */
  available: boolean;
}

/** Full custom agent entity, stored and versioned. */
export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  version: number;
  systemPrompt: string;
  tools: AgentTool[];
  modelConfig: AgentModelConfig;
  status: AgentStatus;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** A historical snapshot of a CustomAgent at a given version. */
export interface AgentVersion {
  agentId: string;
  version: number;
  snapshot: CustomAgent;
  changeNote?: string;
  createdAt: Date;
  createdBy: string;
}

// ─── Builder Wizard ──────────────────────────────────────────────────────────

export type WizardStepStatus = 'pending' | 'active' | 'completed' | 'error';

/** Step 1: Basic identity of the agent. */
export interface WizardStepBasic {
  step: 1;
  name: string;
  description: string;
  tags: string[];
  status: WizardStepStatus;
}

/** Step 2: System prompt authoring. */
export interface WizardStepPrompt {
  step: 2;
  systemPrompt: string;
  variables: string[];        // extracted {{ variable }} placeholders
  previewContext: Record<string, string>;
  status: WizardStepStatus;
}

/** Step 3: Tool selection. */
export interface WizardStepTools {
  step: 3;
  selectedToolIds: string[];
  status: WizardStepStatus;
}

/** Step 4: Model and runtime configuration. */
export interface WizardStepConfig {
  step: 4;
  modelConfig: AgentModelConfig;
  status: WizardStepStatus;
}

/** Step 5: Simulated test conversation. */
export interface WizardStepTest {
  step: 5;
  testMessages: SimulatorMessage[];
  simulationResult?: SimulationResult;
  status: WizardStepStatus;
}

/** Step 6: Deployment review and confirmation. */
export interface WizardStepDeploy {
  step: 6;
  targetEnvironment: 'sandbox' | 'production';
  confirmDeploy: boolean;
  status: WizardStepStatus;
}

export type WizardStep =
  | WizardStepBasic
  | WizardStepPrompt
  | WizardStepTools
  | WizardStepConfig
  | WizardStepTest
  | WizardStepDeploy;

/** Full builder wizard session, tracking progress across all 6 steps. */
export interface BuilderWizardSession {
  sessionId: string;
  agentId?: string;        // populated once the agent is persisted
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  steps: {
    1: WizardStepBasic;
    2: WizardStepPrompt;
    3: WizardStepTools;
    4: WizardStepConfig;
    5: WizardStepTest;
    6: WizardStepDeploy;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ─── Simulator ───────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SimulatorMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
  createdAt: Date;
}

export interface SimulationResult {
  success: boolean;
  messages: SimulatorMessage[];
  tokensUsed: number;
  latencyMs: number;
  toolCallsCount: number;
  errors: string[];
}

// ─── Prompt Editor ───────────────────────────────────────────────────────────

export interface PromptValidationResult {
  valid: boolean;
  errors: PromptValidationError[];
  warnings: PromptValidationWarning[];
  extractedVariables: string[];
  estimatedTokenCount: number;
}

export interface PromptValidationError {
  code: string;
  message: string;
  position?: { line: number; column: number };
}

export interface PromptValidationWarning {
  code: string;
  message: string;
}

export interface PromptPreviewOptions {
  variables: Record<string, string>;
  maxLength?: number;
}
