/**
 * Tests for gateway helpers — resolveSystemPrompt, buildSpawnPayload, buildAgentInstance.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSystemPrompt, buildSpawnPayload, buildAgentInstance } from '../gateway';
import { commsAgentDefinition } from '../agents/comms';
import { financeAgentDefinition } from '../agents/finance';
import type { SpawnOptions } from '../types';

describe('resolveSystemPrompt', () => {
  it('returns base systemPrompt when no businessTemplate given', () => {
    const prompt = resolveSystemPrompt(commsAgentDefinition, {});
    // Should equal the base prompt with default variable substitutions applied
    assert.ok(prompt.includes('UniCore'), 'Resolved prompt should mention UniCore');
    assert.ok(!prompt.includes('{{business_name}}'), 'Should interpolate {{business_name}}');
  });

  it('uses template-specific prompt when businessTemplate matches', () => {
    const basePrompt = resolveSystemPrompt(commsAgentDefinition, {});
    const ecommercePrompt = resolveSystemPrompt(commsAgentDefinition, {
      businessTemplate: 'ecommerce',
    });
    // The ecommerce variant should be different from the base
    assert.notEqual(basePrompt, ecommercePrompt);
    assert.ok(
      ecommercePrompt.toLowerCase().includes('e-commerce'),
      'Ecommerce prompt should reference e-commerce',
    );
  });

  it('falls back to base prompt for unknown/custom template', () => {
    const basePrompt = resolveSystemPrompt(commsAgentDefinition, {});
    const customPrompt = resolveSystemPrompt(commsAgentDefinition, {
      businessTemplate: 'custom',
    });
    assert.equal(basePrompt, customPrompt);
  });

  it('interpolates custom promptVariables', () => {
    const prompt = resolveSystemPrompt(financeAgentDefinition, {
      promptVariables: {
        business_name: 'Acme Corp',
        large_expense_threshold: '5000',
      },
    });
    assert.ok(prompt.includes('Acme Corp'), 'Should interpolate business_name');
    assert.ok(prompt.includes('5000'), 'Should interpolate large_expense_threshold');
  });

  it('merges default variables with provided promptVariables', () => {
    const prompt = resolveSystemPrompt(commsAgentDefinition, {
      promptVariables: { business_name: 'Custom Biz' },
    });
    // business_name should be replaced with Custom Biz
    assert.ok(prompt.includes('Custom Biz'));
  });
});

describe('buildSpawnPayload', () => {
  it('returns a valid SpawnPayload with required fields', () => {
    const options: SpawnOptions = {
      autonomy: 'approval',
      channels: ['email', 'slack'],
      llmProvider: 'anthropic',
    };
    const payload = buildSpawnPayload(commsAgentDefinition, options);

    assert.equal(payload.type, 'spawn');
    assert.equal(payload.agentType, commsAgentDefinition.openClawType);
    assert.ok(typeof payload.systemPrompt === 'string' && payload.systemPrompt.length > 0);
    assert.equal(payload.autonomy, 'approval');
    assert.deepEqual(payload.channels, ['email', 'slack']);
    assert.equal(payload.llmProvider, 'anthropic');
    assert.equal(payload.workingHours, null);
    assert.equal(payload.tools, commsAgentDefinition.tools);
  });

  it('uses definition defaults when options are empty', () => {
    const payload = buildSpawnPayload(commsAgentDefinition, {});

    assert.equal(payload.autonomy, commsAgentDefinition.defaultAutonomy);
    assert.deepEqual(payload.channels, []);
    assert.equal(payload.llmProvider, 'anthropic');
    assert.equal(payload.workingHours, null);
  });

  it('includes metadata with agentId and businessTemplate', () => {
    const payload = buildSpawnPayload(commsAgentDefinition, {
      businessTemplate: 'saas',
    });

    assert.equal(payload.metadata.agentId, 'comms');
    assert.equal(payload.metadata.businessTemplate, 'saas');
    assert.equal(payload.metadata.agentName, 'Comms Agent');
  });

  it('includes workingHours in payload when provided', () => {
    const workingHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
    const payload = buildSpawnPayload(commsAgentDefinition, { workingHours });

    assert.deepEqual(payload.workingHours, workingHours);
  });
});

describe('buildAgentInstance', () => {
  it('creates an AgentInstance with running status', () => {
    const options: SpawnOptions = { autonomy: 'suggest', channels: ['line'] };
    const instance = buildAgentInstance(commsAgentDefinition, options, 'oc-test-001');

    assert.equal(instance.instanceId, 'oc-test-001');
    assert.equal(instance.status, 'running');
    assert.equal(instance.autonomy, 'suggest');
    assert.deepEqual(instance.channels, ['line']);
    assert.equal(instance.definition, commsAgentDefinition);
    assert.equal(instance.lastError, null);
    assert.ok(typeof instance.startedAt === 'string');
  });

  it('sets startedAt to a valid ISO timestamp', () => {
    const instance = buildAgentInstance(commsAgentDefinition, {}, 'oc-test-002');
    assert.doesNotThrow(() => new Date(instance.startedAt!));
  });

  it('uses definition defaultAutonomy when not overridden', () => {
    const instance = buildAgentInstance(commsAgentDefinition, {}, 'oc-test-003');
    assert.equal(instance.autonomy, commsAgentDefinition.defaultAutonomy);
  });
});
