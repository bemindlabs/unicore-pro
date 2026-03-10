import {
  resolveContextPath,
  setContextPath,
  interpolate,
  mergeContext,
  cloneContext,
} from '../engine/context.js';
import type { WorkflowContext } from '../types/index.js';

describe('context helpers', () => {
  describe('resolveContextPath', () => {
    const ctx: WorkflowContext = {
      name: 'Alice',
      score: 99,
      address: { city: 'Bangkok', country: 'Thailand' } as unknown as import('../types/index.js').ContextValue,
      tags: ['a', 'b'] as unknown as import('../types/index.js').ContextValue,
    };

    it('resolves top-level key', () => {
      expect(resolveContextPath(ctx, 'name')).toBe('Alice');
      expect(resolveContextPath(ctx, '$.name')).toBe('Alice');
    });

    it('resolves nested key', () => {
      expect(resolveContextPath(ctx, '$.address.city')).toBe('Bangkok');
    });

    it('returns null for missing path', () => {
      expect(resolveContextPath(ctx, '$.address.zip')).toBeNull();
    });
  });

  describe('setContextPath', () => {
    it('sets a top-level key', () => {
      const ctx: WorkflowContext = {};
      setContextPath(ctx, 'foo', 'bar');
      expect(ctx['foo']).toBe('bar');
    });

    it('sets a nested key, creating intermediates', () => {
      const ctx: WorkflowContext = {};
      setContextPath(ctx, 'a.b.c', 42);
      expect((ctx['a'] as Record<string, unknown>)['b']).toEqual({ c: 42 });
    });
  });

  describe('interpolate', () => {
    const ctx: WorkflowContext = { firstName: 'Bob', score: 50 };

    it('replaces placeholders', () => {
      expect(interpolate('Hello {{firstName}}, your score is {{score}}', ctx)).toBe(
        'Hello Bob, your score is 50',
      );
    });

    it('replaces missing value with empty string', () => {
      expect(interpolate('Hello {{missing}}', ctx)).toBe('Hello ');
    });
  });

  describe('mergeContext', () => {
    it('merges two contexts', () => {
      const a: WorkflowContext = { x: 1, y: 2 };
      const b: WorkflowContext = { y: 99, z: 3 };
      expect(mergeContext(a, b)).toEqual({ x: 1, y: 99, z: 3 });
    });
  });

  describe('cloneContext', () => {
    it('returns a deep clone', () => {
      const ctx: WorkflowContext = { nested: { a: 1 } as unknown as import('../types/index.js').ContextValue };
      const clone = cloneContext(ctx);
      (clone['nested'] as Record<string, unknown>)['a'] = 999;
      expect((ctx['nested'] as Record<string, unknown>)['a']).toBe(1);
    });
  });
});
