/**
 * @unicore/agents-pro — Agent definitions registry
 *
 * All 7 pro specialist agent definitions exported individually and as a
 * unified registry map keyed by AgentId.
 */

export { commsAgentDefinition } from './comms';
export { financeAgentDefinition } from './finance';
export { growthAgentDefinition } from './growth';
export { opsAgentDefinition } from './ops';
export { researchAgentDefinition } from './research';
export { erpAgentDefinition } from './erp';
export { builderAgentDefinition } from './builder';

import { commsAgentDefinition } from './comms';
import { financeAgentDefinition } from './finance';
import { growthAgentDefinition } from './growth';
import { opsAgentDefinition } from './ops';
import { researchAgentDefinition } from './research';
import { erpAgentDefinition } from './erp';
import { builderAgentDefinition } from './builder';

import type { AgentId, AgentDefinition } from '../types';

/**
 * Complete registry of all 7 pro specialist agent definitions.
 * Access any definition by its AgentId.
 *
 * @example
 * const comms = ALL_AGENTS['comms'];
 */
export const ALL_AGENTS: Record<AgentId, AgentDefinition> = {
  comms: commsAgentDefinition,
  finance: financeAgentDefinition,
  growth: growthAgentDefinition,
  ops: opsAgentDefinition,
  research: researchAgentDefinition,
  erp: erpAgentDefinition,
  builder: builderAgentDefinition,
};

/**
 * Ordered list of all agent definitions (useful for rendering UI lists).
 */
export const ALL_AGENTS_LIST: AgentDefinition[] = Object.values(ALL_AGENTS);
