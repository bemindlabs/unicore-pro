import { ConditionEvaluator } from '../engine/condition.evaluator.js';
import type { Condition, WorkflowContext } from '../types/index.js';

describe('ConditionEvaluator', () => {
  const evaluator = new ConditionEvaluator();

  const ctx: WorkflowContext = {
    score: 80,
    status: 'active',
    tags: ['vip', 'enterprise'],
    nested: { deep: { value: 42 } } as unknown as import('../types/index.js').ContextValue,
    nullField: null,
  };

  describe('leaf conditions', () => {
    it('evaluates eq', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'eq', value: 'active' }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'eq', value: 'inactive' }, ctx)).toBe(false);
    });

    it('evaluates neq', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'neq', value: 'inactive' }, ctx)).toBe(true);
    });

    it('evaluates gt / gte / lt / lte', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.score', operator: 'gt', value: 50 }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.score', operator: 'gt', value: 80 }, ctx)).toBe(false);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.score', operator: 'gte', value: 80 }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.score', operator: 'lt', value: 100 }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.score', operator: 'lte', value: 80 }, ctx)).toBe(true);
    });

    it('evaluates contains / not_contains on strings', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'contains', value: 'act' }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'not_contains', value: 'xyz' }, ctx)).toBe(true);
    });

    it('evaluates contains on arrays', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.tags', operator: 'contains', value: 'vip' }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.tags', operator: 'contains', value: 'starter' }, ctx)).toBe(false);
    });

    it('evaluates in / not_in', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'in', value: ['active', 'paused'] }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'not_in', value: ['deleted'] }, ctx)).toBe(true);
    });

    it('evaluates is_null / is_not_null', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.nullField', operator: 'is_null' }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'is_not_null' }, ctx)).toBe(true);
    });

    it('evaluates starts_with / ends_with', () => {
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'starts_with', value: 'act' }, ctx)).toBe(true);
      expect(evaluator.evaluate({ type: 'leaf', field: '$.status', operator: 'ends_with', value: 'ive' }, ctx)).toBe(true);
    });
  });

  describe('composite conditions', () => {
    it('evaluates AND', () => {
      const cond: Condition = {
        type: 'and',
        conditions: [
          { type: 'leaf', field: '$.score', operator: 'gt', value: 50 },
          { type: 'leaf', field: '$.status', operator: 'eq', value: 'active' },
        ],
      };
      expect(evaluator.evaluate(cond, ctx)).toBe(true);
    });

    it('evaluates OR', () => {
      const cond: Condition = {
        type: 'or',
        conditions: [
          { type: 'leaf', field: '$.score', operator: 'gt', value: 100 },
          { type: 'leaf', field: '$.status', operator: 'eq', value: 'active' },
        ],
      };
      expect(evaluator.evaluate(cond, ctx)).toBe(true);
    });

    it('evaluates NOT', () => {
      const cond: Condition = {
        type: 'not',
        condition: { type: 'leaf', field: '$.status', operator: 'eq', value: 'inactive' },
      };
      expect(evaluator.evaluate(cond, ctx)).toBe(true);
    });

    it('evaluates nested AND/OR', () => {
      const cond: Condition = {
        type: 'and',
        conditions: [
          { type: 'leaf', field: '$.score', operator: 'gte', value: 80 },
          {
            type: 'or',
            conditions: [
              { type: 'leaf', field: '$.status', operator: 'eq', value: 'inactive' },
              { type: 'leaf', field: '$.tags', operator: 'contains', value: 'enterprise' },
            ],
          },
        ],
      };
      expect(evaluator.evaluate(cond, ctx)).toBe(true);
    });
  });
});
