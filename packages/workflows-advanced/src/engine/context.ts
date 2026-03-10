/**
 * Workflow execution context helper.
 * Provides get/set with JSONPath-like access and template interpolation.
 */

import type { ContextValue, WorkflowContext } from '../types/index.js';

/**
 * Resolves a dotted path like "$.lead.score" or "lead.score" in a context object.
 */
export function resolveContextPath(context: WorkflowContext, path: string): ContextValue {
  const normalized = path.startsWith('$.') ? path.slice(2) : path.replace(/^\$/, '');
  if (normalized === '' || normalized === '$') return context as unknown as ContextValue;

  const parts = normalized.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return null;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, idx] = arrayMatch;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(idx, 10)];
      } else {
        return null;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current === undefined ? null : (current as ContextValue);
}

/**
 * Sets a value at a dotted path in the context object.
 */
export function setContextPath(context: WorkflowContext, path: string, value: ContextValue): void {
  const normalized = path.startsWith('$.') ? path.slice(2) : path;
  const parts = normalized.split('.');

  let current: Record<string, unknown> = context as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== 'object'
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Interpolates "{{variable}}" placeholders in a template string using context values.
 */
export function interpolate(template: string, context: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = resolveContextPath(context, path.trim());
    return value === null || value === undefined ? '' : String(value);
  });
}

/**
 * Deep-clones a context object.
 */
export function cloneContext(context: WorkflowContext): WorkflowContext {
  return JSON.parse(JSON.stringify(context)) as WorkflowContext;
}

/**
 * Merges patch into base context (shallow merge at top level).
 */
export function mergeContext(
  base: WorkflowContext,
  patch: WorkflowContext,
): WorkflowContext {
  return { ...base, ...patch };
}
