import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LicenseCache } from '../cache';
import type { ValidationResult } from '../types';

const TEST_DIR = join(tmpdir(), 'unicore-license-cache-test');
const TEST_CACHE_FILE = join(TEST_DIR, 'license-cache.json');

const MOCK_LICENSE_KEY = 'UC-TEST-0000-0000-0001';

function mockValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    valid: true,
    licenseKey: MOCK_LICENSE_KEY,
    tier: 'professional',
    status: 'active',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    features: {
      maxAgents: 10,
      maxWorkflows: 50,
      customBranding: true,
      ssoEnabled: true,
      auditLog: true,
      prioritySupport: true,
      customIntegrations: false,
      multiTenant: false,
      advancedAnalytics: true,
      whiteLabel: false,
    },
    limits: {
      maxUsers: 100,
      maxAgents: 10,
      maxWorkflows: 50,
    },
    ...overrides,
  };
}

describe('LicenseCache', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should return null for empty cache', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const result = cache.get(MOCK_LICENSE_KEY);
    assert.equal(result, null);
  });

  it('should store and retrieve a validation result', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);
    const result = cache.get(MOCK_LICENSE_KEY);

    assert.deepEqual(result, mockResult);
  });

  it('should return null for expired cache', () => {
    const cache = new LicenseCache({
      cacheFilePath: TEST_CACHE_FILE,
      cacheDurationMs: 0, // Immediately expires
    });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);
    const result = cache.get(MOCK_LICENSE_KEY);

    assert.equal(result, null);
  });

  it('should honor cacheUntil from server response', () => {
    const cache = new LicenseCache({
      cacheFilePath: TEST_CACHE_FILE,
      cacheDurationMs: 0, // Would expire immediately
    });
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockResult = mockValidationResult({ cacheUntil: futureDate });

    cache.set(MOCK_LICENSE_KEY, mockResult);
    const result = cache.get(MOCK_LICENSE_KEY);

    assert.deepEqual(result, mockResult);
  });

  it('should return null when cacheUntil is in the past', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const mockResult = mockValidationResult({ cacheUntil: pastDate });

    cache.set(MOCK_LICENSE_KEY, mockResult);
    const result = cache.get(MOCK_LICENSE_KEY);

    assert.equal(result, null);
  });

  it('should support offline grace period', () => {
    const cache = new LicenseCache({
      cacheFilePath: TEST_CACHE_FILE,
      cacheDurationMs: 0, // Normal cache expired
      offlineGracePeriodMs: 60 * 60 * 1000, // 1 hour grace
    });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);

    // Normal get should return null (cache expired)
    assert.equal(cache.get(MOCK_LICENSE_KEY), null);

    // Grace period get should still work
    const graceResult = cache.getWithGracePeriod(MOCK_LICENSE_KEY);
    assert.deepEqual(graceResult, mockResult);
  });

  it('should return null when grace period is also expired', () => {
    const cache = new LicenseCache({
      cacheFilePath: TEST_CACHE_FILE,
      cacheDurationMs: 0,
      offlineGracePeriodMs: 0,
    });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);
    const result = cache.getWithGracePeriod(MOCK_LICENSE_KEY);

    assert.equal(result, null);
  });

  it('should clear a specific license key', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);
    cache.set('UC-TEST-0000-0000-0002', mockResult);

    cache.clear(MOCK_LICENSE_KEY);

    assert.equal(cache.get(MOCK_LICENSE_KEY), null);
    assert.notEqual(cache.get('UC-TEST-0000-0000-0002'), null);
  });

  it('should clear all cached data', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const mockResult = mockValidationResult();

    cache.set(MOCK_LICENSE_KEY, mockResult);
    cache.set('UC-TEST-0000-0000-0002', mockResult);

    cache.clear();

    assert.equal(cache.get(MOCK_LICENSE_KEY), null);
    assert.equal(cache.get('UC-TEST-0000-0000-0002'), null);
  });

  it('should handle corrupted cache file gracefully', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CACHE_FILE, 'not valid json');

    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const result = cache.get(MOCK_LICENSE_KEY);

    assert.equal(result, null);
  });

  it('should isolate cache entries per license key', () => {
    const cache = new LicenseCache({ cacheFilePath: TEST_CACHE_FILE });
    const result1 = mockValidationResult({ tier: 'professional' });
    const result2 = mockValidationResult({ tier: 'enterprise' });

    cache.set('UC-KEY-0001', result1);
    cache.set('UC-KEY-0002', result2);

    assert.equal(cache.get('UC-KEY-0001')?.tier, 'professional');
    assert.equal(cache.get('UC-KEY-0002')?.tier, 'enterprise');
  });
});
