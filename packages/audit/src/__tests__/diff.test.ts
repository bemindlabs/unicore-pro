import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeDiff, changedFields, redactSensitive } from '../diff.js';

describe('computeDiff', () => {
  it('returns empty array for identical objects', () => {
    const result = computeDiff({ a: 1, b: 'hello' }, { a: 1, b: 'hello' });
    assert.deepEqual(result, []);
  });

  it('detects added fields', () => {
    const result = computeDiff({ a: 1 }, { a: 1, b: 2 });
    assert.equal(result.length, 1);
    assert.equal(result[0].field, 'b');
    assert.equal(result[0].kind, 'added');
    assert.equal(result[0].before, undefined);
    assert.equal(result[0].after, 2);
  });

  it('detects removed fields', () => {
    const result = computeDiff({ a: 1, b: 2 }, { a: 1 });
    assert.equal(result.length, 1);
    assert.equal(result[0].field, 'b');
    assert.equal(result[0].kind, 'removed');
    assert.equal(result[0].before, 2);
    assert.equal(result[0].after, undefined);
  });

  it('detects changed scalar fields', () => {
    const result = computeDiff({ name: 'Alice' }, { name: 'Bob' });
    assert.equal(result.length, 1);
    assert.equal(result[0].field, 'name');
    assert.equal(result[0].kind, 'changed');
    assert.equal(result[0].before, 'Alice');
    assert.equal(result[0].after, 'Bob');
  });

  it('recurses into nested objects', () => {
    const before = { address: { city: 'Bangkok', zip: '10100' } };
    const after = { address: { city: 'Chiang Mai', zip: '50000' } };
    const result = computeDiff(before, after);
    assert.equal(result.length, 2);
    const cityDiff = result.find((d) => d.field === 'address.city');
    assert.ok(cityDiff);
    assert.equal(cityDiff.before, 'Bangkok');
    assert.equal(cityDiff.after, 'Chiang Mai');
  });

  it('treats array changes as changed (not element diff)', () => {
    const result = computeDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b', 'c'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'changed');
  });

  it('handles null/undefined inputs gracefully', () => {
    const result = computeDiff(null, { a: 1 });
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'added');
  });
});

describe('changedFields', () => {
  it('returns a map of changed fields', () => {
    const before = { name: 'Alice', age: 30, email: 'a@b.com' };
    const after = { name: 'Alice', age: 31, email: 'a@b.com' };
    const result = changedFields(before, after);
    assert.deepEqual(Object.keys(result), ['age']);
    assert.equal(result['age'].before, 30);
    assert.equal(result['age'].after, 31);
  });

  it('returns empty map for equal objects', () => {
    const result = changedFields({ x: 1 }, { x: 1 });
    assert.deepEqual(result, {});
  });
});

describe('redactSensitive', () => {
  it('replaces known sensitive keys with [REDACTED]', () => {
    const obj = {
      name: 'Alice',
      password: 'supersecret',
      token: 'abc123',
      nested: {
        apiKey: 'sk-xxx',
        value: 42,
      },
    };
    const result = redactSensitive(obj);
    assert.equal(result['name'], 'Alice');
    assert.equal(result['password'], '[REDACTED]');
    assert.equal(result['token'], '[REDACTED]');
    const nested = result['nested'] as Record<string, unknown>;
    assert.equal(nested['apiKey'], '[REDACTED]');
    assert.equal(nested['value'], 42);
  });

  it('leaves non-sensitive fields untouched', () => {
    const obj = { email: 'alice@example.com', role: 'admin' };
    const result = redactSensitive(obj);
    assert.deepEqual(result, obj);
  });
});
