/**
 * @unicore/agents-pro
 *
 * Pro specialist agent definitions, prompt templates, and lifecycle
 * management for the UniCore Pro Edition.
 *
 * Exports:
 * - AgentDefinition interface and all supporting types
 * - 7 specialist agent definitions (Comms, Finance, Growth, Ops, Research, ERP, Builder)
 * - Agent registry (ALL_AGENTS, ALL_AGENTS_LIST)
 * - OpenClaw Gateway client (OpenClawGatewayClient)
 * - Lifecycle manager (AgentLifecycleManager, createLifecycleManager)
 * - Prompt utilities (interpolatePrompt)
 */

// Types
export type {
  AgentId,
  AgentDefinition,
  AgentTool,
  AgentCapability,
  AgentStatus,
  AgentInstance,
  SpawnOptions,
  AutonomyLevel,
  WorkingHours,
  BusinessTemplate,
  OpenClawGatewayOptions,
  AgentLifecycleManagerOptions,
} from './types';

// Agent definitions and registry
export {
  commsAgentDefinition,
  financeAgentDefinition,
  growthAgentDefinition,
  opsAgentDefinition,
  researchAgentDefinition,
  erpAgentDefinition,
  builderAgentDefinition,
  ALL_AGENTS,
  ALL_AGENTS_LIST,
} from './agents/index';

// Gateway client and spawn helpers
export {
  OpenClawGatewayClient,
  resolveSystemPrompt,
  buildSpawnPayload,
  buildAgentInstance,
} from './gateway';

// Lifecycle manager
export {
  AgentLifecycleManager,
  createLifecycleManager,
} from './lifecycle';

// Prompt utilities
export {
  interpolatePrompt,
  SHARED_PREAMBLE,
  SHARED_MEMORY_INSTRUCTION,
  SHARED_ESCALATION_INSTRUCTION,
} from './prompts';
