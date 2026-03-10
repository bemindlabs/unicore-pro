/**
 * Tests for agent definitions registry and definition integrity.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_AGENTS,
  ALL_AGENTS_LIST,
  commsAgentDefinition,
  financeAgentDefinition,
  growthAgentDefinition,
  opsAgentDefinition,
  researchAgentDefinition,
  erpAgentDefinition,
  builderAgentDefinition,
} from '../agents/index';

import type { AgentId, AgentDefinition } from '../types';

const EXPECTED_AGENT_IDS: AgentId[] = [
  'comms',
  'finance',
  'growth',
  'ops',
  'research',
  'erp',
  'builder',
];

describe('ALL_AGENTS registry', () => {
  it('should contain exactly 7 agents', () => {
    assert.equal(Object.keys(ALL_AGENTS).length, 7);
  });

  it('should contain all expected agent IDs', () => {
    for (const id of EXPECTED_AGENT_IDS) {
      assert.ok(
        id in ALL_AGENTS,
        `Expected agent ID "${id}" to be present in ALL_AGENTS`,
      );
    }
  });

  it('ALL_AGENTS_LIST should have 7 entries matching the registry', () => {
    assert.equal(ALL_AGENTS_LIST.length, 7);
    for (const def of ALL_AGENTS_LIST) {
      assert.equal(ALL_AGENTS[def.id as AgentId], def);
    }
  });
});

describe('Agent definition shape', () => {
  function assertValidDefinition(def: AgentDefinition): void {
    // Identity
    assert.ok(def.id, `${def.name}: id must be non-empty`);
    assert.ok(def.name, `${def.id}: name must be non-empty`);
    assert.ok(def.description, `${def.id}: description must be non-empty`);
    assert.ok(def.icon, `${def.id}: icon must be non-empty`);
    assert.ok(def.openClawType, `${def.id}: openClawType must be non-empty`);

    // Prompts
    assert.ok(
      def.systemPrompt.length > 200,
      `${def.id}: systemPrompt is too short (< 200 chars)`,
    );
    assert.ok(
      typeof def.templatePrompts === 'object',
      `${def.id}: templatePrompts must be an object`,
    );

    // Tools
    assert.ok(def.tools.length > 0, `${def.id}: must have at least one tool`);
    for (const tool of def.tools) {
      assert.ok(tool.name, `${def.id} tool: name must be non-empty`);
      assert.ok(tool.description, `${def.id} tool "${tool.name}": description must be non-empty`);
      assert.ok(
        tool.inputSchema && typeof tool.inputSchema === 'object',
        `${def.id} tool "${tool.name}": inputSchema must be an object`,
      );
    }

    // Capabilities
    assert.ok(
      def.capabilities.length > 0,
      `${def.id}: must declare at least one capability`,
    );

    // Autonomy
    assert.ok(
      ['full_auto', 'approval', 'suggest'].includes(def.defaultAutonomy),
      `${def.id}: defaultAutonomy must be 'full_auto', 'approval', or 'suggest'`,
    );

    // Enabled flag
    assert.ok(
      typeof def.defaultEnabled === 'boolean',
      `${def.id}: defaultEnabled must be boolean`,
    );
  }

  for (const [id, def] of Object.entries(ALL_AGENTS)) {
    it(`${id} definition passes shape validation`, () => {
      assertValidDefinition(def as AgentDefinition);
    });
  }
});

describe('Individual agent exports', () => {
  it('commsAgentDefinition matches registry entry', () => {
    assert.equal(commsAgentDefinition, ALL_AGENTS['comms']);
  });

  it('financeAgentDefinition matches registry entry', () => {
    assert.equal(financeAgentDefinition, ALL_AGENTS['finance']);
  });

  it('growthAgentDefinition matches registry entry', () => {
    assert.equal(growthAgentDefinition, ALL_AGENTS['growth']);
  });

  it('opsAgentDefinition matches registry entry', () => {
    assert.equal(opsAgentDefinition, ALL_AGENTS['ops']);
  });

  it('researchAgentDefinition matches registry entry', () => {
    assert.equal(researchAgentDefinition, ALL_AGENTS['research']);
  });

  it('erpAgentDefinition matches registry entry', () => {
    assert.equal(erpAgentDefinition, ALL_AGENTS['erp']);
  });

  it('builderAgentDefinition matches registry entry', () => {
    assert.equal(builderAgentDefinition, ALL_AGENTS['builder']);
  });
});

describe('Default-enabled agents', () => {
  it('comms, finance, growth, ops, erp should be default-enabled', () => {
    const defaultEnabled: AgentId[] = ['comms', 'finance', 'growth', 'ops', 'erp'];
    for (const id of defaultEnabled) {
      assert.ok(
        ALL_AGENTS[id].defaultEnabled,
        `Expected ${id} to be default-enabled`,
      );
    }
  });

  it('research and builder should be default-disabled', () => {
    const defaultDisabled: AgentId[] = ['research', 'builder'];
    for (const id of defaultDisabled) {
      assert.equal(
        ALL_AGENTS[id].defaultEnabled,
        false,
        `Expected ${id} to be default-disabled`,
      );
    }
  });
});

describe('Template prompts', () => {
  it('comms agent should have ecommerce, saas, agency, retail, professional_services, content_creator templates', () => {
    const expected = ['ecommerce', 'saas', 'agency', 'retail', 'professional_services', 'content_creator'];
    for (const t of expected) {
      assert.ok(
        t in commsAgentDefinition.templatePrompts,
        `Comms agent missing template: ${t}`,
      );
    }
  });

  it('each template prompt should be longer than the base systemPrompt minimum (200 chars)', () => {
    for (const [agentId, def] of Object.entries(ALL_AGENTS)) {
      for (const [template, prompt] of Object.entries(def.templatePrompts)) {
        assert.ok(
          typeof prompt === 'string' && prompt.length > 200,
          `${agentId}/${template} template prompt is too short`,
        );
      }
    }
  });
});

describe('Ops agent defaults', () => {
  it('should have full_auto as default autonomy', () => {
    assert.equal(opsAgentDefinition.defaultAutonomy, 'full_auto');
  });
});

describe('Finance agent defaults', () => {
  it('should have suggest as default autonomy', () => {
    assert.equal(financeAgentDefinition.defaultAutonomy, 'suggest');
  });
});
