import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LicenseClient } from '../client';
import type { ValidationResult, FeatureFlags } from '../types';

const TEST_DIR = join(tmpdir(), 'unicore-license-client-test');

const MOCK_LICENSE_KEY = 'UC-TEST-0000-0000-0001';
const MOCK_SERVER_URL = 'https://license.example.com';

function uniqueCachePath(): string {
  return join(TEST_DIR, `cache-${randomUUID()}.json`);
}

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

function mockFeatureFlags(): FeatureFlags {
  return {
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
  };
}

describe('LicenseClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(TEST_DIR, { recursive: true, force: true });
    mock.restoreAll();
  });

  it('should throw if licenseKey is missing', () => {
    assert.throws(
      () => new LicenseClient({ licenseKey: '', serverUrl: MOCK_SERVER_URL }),
      { message: 'licenseKey and serverUrl are required' },
    );
  });

  it('should throw if serverUrl is missing', () => {
    assert.throws(
      () => new LicenseClient({ licenseKey: MOCK_LICENSE_KEY, serverUrl: '' }),
      { message: 'licenseKey and serverUrl are required' },
    );
  });

  it('should validate a license against the server', async () => {
    const validationResult = mockValidationResult();
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init! });
      return new Response(
        JSON.stringify(validationResult),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    const result = await client.validate();

    assert.deepEqual(result, validationResult);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, `${MOCK_SERVER_URL}/api/v1/validate`);
    assert.equal(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.equal(body.licenseKey, MOCK_LICENSE_KEY);
    assert.ok(body.fingerprint);
    assert.ok(body.fingerprint.hash);
  });

  it('should return cached result on subsequent validate calls', async () => {
    const validationResult = mockValidationResult({
      cacheUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify(validationResult),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    await client.validate();
    await client.validate();

    // Only one fetch call — second used cache
    assert.equal(fetchCount, 1);
  });

  it('should get feature flags from server', async () => {
    const features = mockFeatureFlags();
    const fetchCalls: Array<{ url: string }> = [];

    globalThis.fetch = async (input: string | URL | Request) => {
      fetchCalls.push({ url: String(input) });
      return new Response(
        JSON.stringify(features),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    const result = await client.getFeatures();

    assert.deepEqual(result, features);
    assert.equal(fetchCalls[0].url, `${MOCK_SERVER_URL}/api/v1/features/${MOCK_LICENSE_KEY}`);
  });

  it('should check if a specific feature is enabled', async () => {
    const features = mockFeatureFlags();

    globalThis.fetch = async () => new Response(
      JSON.stringify(features),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    assert.equal(await client.isFeatureEnabled('ssoEnabled'), true);
    assert.equal(await client.isFeatureEnabled('multiTenant'), false);
  });

  it('should return cached validation from getCachedValidation', async () => {
    const validationResult = mockValidationResult();

    globalThis.fetch = async () => new Response(
      JSON.stringify(validationResult),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    // Before validate, should be null
    assert.equal(client.getCachedValidation(), null);

    await client.validate();

    // After validate, should return result
    assert.deepEqual(client.getCachedValidation(), validationResult);
  });

  it('should force revalidation on refresh', async () => {
    const result1 = mockValidationResult({ tier: 'professional' });
    const result2 = mockValidationResult({ tier: 'enterprise' });

    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      const result = callCount === 1 ? result1 : result2;
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    const first = await client.validate();
    assert.equal(first.tier, 'professional');

    const refreshed = await client.refresh();
    assert.equal(refreshed.tier, 'enterprise');
    assert.equal(callCount, 2);
  });

  it('should report analytics to server', async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init! });
      return new Response(null, { status: 204 });
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    await client.reportAnalytics({
      activeUsers: 42,
      activeAgents: 5,
      activeWorkflows: 10,
      apiCalls: 1500,
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, `${MOCK_SERVER_URL}/api/v1/analytics`);
    assert.equal(fetchCalls[0].init.method, 'POST');

    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.equal(body.licenseKey, MOCK_LICENSE_KEY);
    assert.equal(body.activeUsers, 42);
    assert.ok(body.timestamp);
  });

  it('should throw on 4xx errors without retry', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response('License not found', { status: 404, statusText: 'Not Found' });
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: MOCK_SERVER_URL,
      cacheFilePath: uniqueCachePath(),
    });

    await assert.rejects(
      () => client.validate(),
      (error: Error) => {
        assert.match(error.message, /404/);
        return true;
      },
    );

    // Should NOT retry on 4xx
    assert.equal(fetchCount, 1);
  });

  it('should strip trailing slashes from serverUrl', async () => {
    const validationResult = mockValidationResult();
    const fetchCalls: Array<{ url: string }> = [];

    globalThis.fetch = async (input: string | URL | Request) => {
      fetchCalls.push({ url: String(input) });
      return new Response(
        JSON.stringify(validationResult),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new LicenseClient({
      licenseKey: MOCK_LICENSE_KEY,
      serverUrl: `${MOCK_SERVER_URL}///`,
      cacheFilePath: uniqueCachePath(),
    });

    await client.validate();

    assert.equal(fetchCalls[0].url, `${MOCK_SERVER_URL}/api/v1/validate`);
  });
});
