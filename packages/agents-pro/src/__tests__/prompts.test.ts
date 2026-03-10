/**
 * Tests for prompt utilities — interpolation and shared fragments.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  interpolatePrompt,
  SHARED_PREAMBLE,
  SHARED_MEMORY_INSTRUCTION,
  SHARED_ESCALATION_INSTRUCTION,
} from '../prompts';

describe('interpolatePrompt', () => {
  it('replaces a single variable', () => {
    const result = interpolatePrompt('Hello, {{name}}!', { name: 'Acme' });
    assert.equal(result, 'Hello, Acme!');
  });

  it('replaces multiple variables', () => {
    const result = interpolatePrompt(
      '{{business_name}} — template: {{template}}',
      { business_name: 'My Shop', template: 'ecommerce' },
    );
    assert.equal(result, 'My Shop — template: ecommerce');
  });

  it('leaves unresolved tokens unchanged', () => {
    const result = interpolatePrompt('Hello, {{name}}!', {});
    assert.equal(result, 'Hello, {{name}}!');
  });

  it('handles a template with no tokens', () => {
    const result = interpolatePrompt('No tokens here.', { foo: 'bar' });
    assert.equal(result, 'No tokens here.');
  });

  it('replaces the same token multiple times', () => {
    const result = interpolatePrompt('{{x}} and {{x}}', { x: 'A' });
    assert.equal(result, 'A and A');
  });

  it('does not mutate the original variables object', () => {
    const vars = { name: 'Alice' };
    interpolatePrompt('{{name}}', vars);
    assert.deepEqual(vars, { name: 'Alice' });
  });

  it('handles empty string values', () => {
    const result = interpolatePrompt('hello {{name}} world', { name: '' });
    assert.equal(result, 'hello  world');
  });
});

describe('Shared prompt fragments', () => {
  it('SHARED_PREAMBLE contains business_name token', () => {
    assert.ok(
      SHARED_PREAMBLE.includes('{{business_name}}'),
      'SHARED_PREAMBLE should contain {{business_name}} interpolation token',
    );
  });

  it('SHARED_PREAMBLE mentions OpenClaw', () => {
    assert.ok(
      SHARED_PREAMBLE.toLowerCase().includes('openclaw'),
      'SHARED_PREAMBLE should mention OpenClaw',
    );
  });

  it('SHARED_MEMORY_INSTRUCTION mentions RAG', () => {
    assert.ok(
      SHARED_MEMORY_INSTRUCTION.toLowerCase().includes('rag'),
      'SHARED_MEMORY_INSTRUCTION should mention RAG',
    );
  });

  it('SHARED_ESCALATION_INSTRUCTION mentions Router Agent', () => {
    assert.ok(
      SHARED_ESCALATION_INSTRUCTION.toLowerCase().includes('router agent'),
      'SHARED_ESCALATION_INSTRUCTION should mention Router Agent',
    );
  });

  it('all shared fragments are non-empty strings > 50 chars', () => {
    const fragments = [SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION];
    for (const f of fragments) {
      assert.ok(typeof f === 'string' && f.length > 50);
    }
  });
});
