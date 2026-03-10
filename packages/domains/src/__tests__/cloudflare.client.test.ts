/**
 * CloudflareClient unit tests.
 *
 * Uses the native node:test runner (no Jest) and intercepts `fetch` via a
 * module-level mock so no real HTTP calls are made.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareClient } from '../services/cloudflare.client.js';
import { DOMAINS_MODULE_OPTIONS } from '../domains.constants.js';
import type { DomainsModuleOptions } from '../types/domains.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_OPTIONS: DomainsModuleOptions = {
  cloudflare: {
    apiToken: 'test-token-abc',
    platformHostname: 'platform.unicore.io',
    baseUrl: 'https://api.cloudflare.com/client/v4',
  },
};

function makeClient(fetchImpl: typeof fetch): CloudflareClient {
  // CloudflareClient uses `fetch` from global scope; we replace it for tests.
  (globalThis as Record<string, unknown>).fetch = fetchImpl;

  // Minimal NestJS Reflect-Metadata Inject mock: CloudflareClient reads
  // options via constructor injection — we instantiate directly.
  const client = new (CloudflareClient as unknown as new (opts: DomainsModuleOptions) => CloudflareClient)(
    TEST_OPTIONS,
  );
  return client;
}

function makeSuccessResponse<T>(result: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, errors: [], messages: [], result }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeErrorResponse(code: number, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, errors: [{ code, message }], messages: [], result: null }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudflareClient', () => {
  describe('findZoneForDomain', () => {
    it('resolves zone for an apex domain', async () => {
      const zonePayload = [{
        id: 'zone-123',
        name: 'acme.com',
        status: 'active',
        paused: false,
        type: 'full',
        name_servers: ['ns1.cf.com'],
      }];

      const fetchMock = async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('zones') && urlStr.includes('name=acme.com')) {
          return makeSuccessResponse(zonePayload);
        }
        return makeSuccessResponse([]);
      };

      const client = makeClient(fetchMock as unknown as typeof fetch);
      const zone = await client.findZoneForDomain('acme.com');

      assert.equal(zone.id, 'zone-123');
      assert.equal(zone.name, 'acme.com');
      assert.deepEqual(zone.nameServers, ['ns1.cf.com']);
    });

    it('resolves zone for a subdomain by stripping to apex', async () => {
      const zonePayload = [{
        id: 'zone-456',
        name: 'acme.com',
        status: 'active',
        paused: false,
        type: 'full',
        name_servers: [],
      }];

      const fetchMock = async (url: string | URL | Request) => {
        const urlStr = url.toString();
        // Returns empty for subdomain lookup, zone for apex
        if (urlStr.includes('name=acme.com') && !urlStr.includes('app.')) {
          return makeSuccessResponse(zonePayload);
        }
        return makeSuccessResponse([]);
      };

      const client = makeClient(fetchMock as unknown as typeof fetch);
      const zone = await client.findZoneForDomain('app.acme.com');
      assert.equal(zone.id, 'zone-456');
    });

    it('throws NotFoundException when no zone matches', async () => {
      const fetchMock = async () => makeSuccessResponse([]);
      const client = makeClient(fetchMock as unknown as typeof fetch);

      await assert.rejects(
        () => client.findZoneForDomain('unknown-domain.xyz'),
        (err: Error) => {
          assert.match(err.message, /No Cloudflare zone found/);
          return true;
        },
      );
    });
  });

  describe('createDnsRecord', () => {
    it('creates a CNAME record and returns the mapped result', async () => {
      const rawRecord = {
        id: 'rec-789',
        type: 'CNAME',
        name: 'app.acme.com',
        content: 'platform.unicore.io',
        ttl: 1,
        proxied: true,
        zone_id: 'zone-123',
        zone_name: 'acme.com',
        created_on: '2026-01-01T00:00:00Z',
        modified_on: '2026-01-01T00:00:00Z',
      };

      const fetchMock = async () => makeSuccessResponse(rawRecord, 200);
      const client = makeClient(fetchMock as unknown as typeof fetch);

      const result = await client.createDnsRecord({
        zoneId: 'zone-123',
        type: 'CNAME',
        name: 'app.acme.com',
        content: 'platform.unicore.io',
        proxied: true,
      });

      assert.equal(result.id, 'rec-789');
      assert.equal(result.type, 'CNAME');
      assert.equal(result.content, 'platform.unicore.io');
      assert.equal(result.proxied, true);
      assert.equal(result.zoneId, 'zone-123');
    });
  });

  describe('deleteDnsRecord', () => {
    it('calls DELETE and resolves without error', async () => {
      let deleteCalled = false;
      const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'DELETE') deleteCalled = true;
        return makeSuccessResponse({ id: 'rec-789' });
      };

      const client = makeClient(fetchMock as unknown as typeof fetch);
      await client.deleteDnsRecord('zone-123', 'rec-789');
      assert.equal(deleteCalled, true);
    });
  });

  describe('updateDnsRecord', () => {
    it('calls PUT and returns mapped record', async () => {
      let putCalled = false;
      const rawRecord = {
        id: 'rec-789',
        type: 'CNAME',
        name: 'app.acme.com',
        content: 'platform-v2.unicore.io',
        ttl: 1,
        proxied: false,
        zone_id: 'zone-123',
        zone_name: 'acme.com',
        created_on: '2026-01-01T00:00:00Z',
        modified_on: '2026-03-01T00:00:00Z',
      };
      const fetchMock = async (_url: unknown, init?: RequestInit) => {
        if (init?.method === 'PUT') putCalled = true;
        return makeSuccessResponse(rawRecord);
      };

      const client = makeClient(fetchMock as unknown as typeof fetch);
      const result = await client.updateDnsRecord({
        zoneId: 'zone-123',
        recordId: 'rec-789',
        type: 'CNAME',
        name: 'app.acme.com',
        content: 'platform-v2.unicore.io',
      });

      assert.equal(putCalled, true);
      assert.equal(result.content, 'platform-v2.unicore.io');
    });
  });

  describe('error handling', () => {
    it('throws InternalServerErrorException on API error response', async () => {
      const fetchMock = async () => makeErrorResponse(7003, 'No route for that URI', 400);
      const client = makeClient(fetchMock as unknown as typeof fetch);

      await assert.rejects(
        () => client.getDnsRecord('zone-123', 'bad-record'),
        (err: Error) => {
          assert.match(err.message, /Cloudflare API error/);
          return true;
        },
      );
    });
  });
});
