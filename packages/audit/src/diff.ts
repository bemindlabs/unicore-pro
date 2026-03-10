/**
 * diff.ts — shallow + deep diffing utilities for before/after change tracking.
 *
 * These helpers intentionally avoid any third-party diffing library to keep the
 * package dependency-free outside of NestJS / Prisma.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue }
export type JsonArray = JsonValue[];

// ─── Field-level diff ─────────────────────────────────────────────────────────

export interface FieldDiff {
  /** Dot-notation path to the changed field, e.g. "address.city" */
  field: string;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
  /** "added" | "removed" | "changed" */
  kind: 'added' | 'removed' | 'changed';
}

/**
 * Compute a deep field-level diff between two plain objects.
 * Arrays are compared by value (not element-by-element) to keep diffs simple.
 *
 * @param before  The original state (or null/undefined for create actions).
 * @param after   The new state (or null/undefined for delete actions).
 * @param path    Internal recursion prefix — callers should omit this.
 * @returns       Array of changed fields, or empty array when objects are equal.
 */
export function computeDiff(
  before: JsonObject | null | undefined,
  after: JsonObject | null | undefined,
  path = '',
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const beforeObj: JsonObject = before ?? {};
  const afterObj: JsonObject = after ?? {};

  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const bVal = beforeObj[key];
    const aVal = afterObj[key];

    const bMissing = !(key in beforeObj);
    const aMissing = !(key in afterObj);

    if (bMissing && !aMissing) {
      diffs.push({ field: fullPath, before: undefined, after: aVal, kind: 'added' });
    } else if (!bMissing && aMissing) {
      diffs.push({ field: fullPath, before: bVal, after: undefined, kind: 'removed' });
    } else if (isPlainObject(bVal) && isPlainObject(aVal)) {
      // Recurse into nested objects
      diffs.push(...computeDiff(bVal as JsonObject, aVal as JsonObject, fullPath));
    } else if (!deepEqual(bVal, aVal)) {
      diffs.push({ field: fullPath, before: bVal, after: aVal, kind: 'changed' });
    }
  }

  return diffs;
}

/**
 * Produce a compact summary object containing only the fields that changed.
 * Useful for storing a "changed fields" snapshot alongside full before/after.
 */
export function changedFields(
  before: JsonObject | null | undefined,
  after: JsonObject | null | undefined,
): Record<string, { before: JsonValue | undefined; after: JsonValue | undefined }> {
  const diffs = computeDiff(before, after);
  const result: Record<string, { before: JsonValue | undefined; after: JsonValue | undefined }> = {};
  for (const d of diffs) {
    result[d.field] = { before: d.before, after: d.after };
  }
  return result;
}

/**
 * Strip keys that should never appear in audit diffs (passwords, tokens, secrets).
 * Operates recursively on plain objects; arrays are left untouched.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'hashedPassword',
  'token', 'accessToken', 'refreshToken', 'apiKey', 'secret',
  'privateKey', 'clientSecret', 'sessionToken', 'otp', 'pin',
]);

export function redactSensitive(obj: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (isPlainObject(val)) {
      result[key] = redactSensitive(val as JsonObject);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlainObject(val: unknown): val is JsonObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function deepEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], (b as JsonObject)[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  return false;
}
