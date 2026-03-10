/**
 * Condition evaluator
 * Evaluates Condition expressions against a WorkflowContext.
 */

import type {
  Condition,
  LeafCondition,
  CompositeCondition,
  NotCondition,
  ContextValue,
  WorkflowContext,
} from '../types/index.js';
import { resolveContextPath } from './context.js';

export class ConditionEvaluator {
  evaluate(condition: Condition, context: WorkflowContext): boolean {
    switch (condition.type) {
      case 'leaf':
        return this.evaluateLeaf(condition, context);
      case 'and':
        return this.evaluateComposite(condition, context, true);
      case 'or':
        return this.evaluateComposite(condition, context, false);
      case 'not':
        return this.evaluateNot(condition, context);
      default: {
        const exhaustive: never = condition;
        throw new Error(`Unknown condition type: ${(exhaustive as Condition).type}`);
      }
    }
  }

  private evaluateLeaf(condition: LeafCondition, context: WorkflowContext): boolean {
    const fieldValue = resolveContextPath(context, condition.field);
    const { operator, value: expected } = condition;

    switch (operator) {
      case 'eq':
        return fieldValue === expected;
      case 'neq':
        return fieldValue !== expected;
      case 'gt':
        return typeof fieldValue === 'number' && typeof expected === 'number'
          ? fieldValue > expected
          : false;
      case 'gte':
        return typeof fieldValue === 'number' && typeof expected === 'number'
          ? fieldValue >= expected
          : false;
      case 'lt':
        return typeof fieldValue === 'number' && typeof expected === 'number'
          ? fieldValue < expected
          : false;
      case 'lte':
        return typeof fieldValue === 'number' && typeof expected === 'number'
          ? fieldValue <= expected
          : false;
      case 'contains':
        if (typeof fieldValue === 'string' && typeof expected === 'string') {
          return fieldValue.includes(expected);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(expected);
        }
        return false;
      case 'not_contains':
        if (typeof fieldValue === 'string' && typeof expected === 'string') {
          return !fieldValue.includes(expected);
        }
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(expected);
        }
        return true;
      case 'starts_with':
        return typeof fieldValue === 'string' && typeof expected === 'string'
          ? fieldValue.startsWith(expected)
          : false;
      case 'ends_with':
        return typeof fieldValue === 'string' && typeof expected === 'string'
          ? fieldValue.endsWith(expected)
          : false;
      case 'in':
        return Array.isArray(expected) ? expected.includes(fieldValue) : false;
      case 'not_in':
        return Array.isArray(expected) ? !expected.includes(fieldValue) : true;
      case 'is_null':
        return fieldValue === null || fieldValue === undefined;
      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined;
      default: {
        const exhaustive: never = operator;
        throw new Error(`Unknown operator: ${exhaustive}`);
      }
    }
  }

  private evaluateComposite(
    condition: CompositeCondition,
    context: WorkflowContext,
    isAnd: boolean,
  ): boolean {
    if (isAnd) {
      return condition.conditions.every((c) => this.evaluate(c, context));
    }
    return condition.conditions.some((c) => this.evaluate(c, context));
  }

  private evaluateNot(condition: NotCondition, context: WorkflowContext): boolean {
    return !this.evaluate(condition.condition, context);
  }
}

/**
 * Resolve a context value that may be a literal number, or a string referencing
 * a context variable (e.g. "$.loop.count").
 */
export function resolveCount(
  value: number | string,
  context: WorkflowContext,
): number {
  if (typeof value === 'number') return value;
  const resolved = resolveContextPath(context, value);
  if (typeof resolved === 'number') return resolved;
  const parsed = Number(resolved);
  if (isNaN(parsed)) throw new Error(`Cannot resolve count from "${value}": got ${String(resolved)}`);
  return parsed;
}
