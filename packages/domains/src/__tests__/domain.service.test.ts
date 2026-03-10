/**
 * DomainService unit tests.
 *
 * Uses the native node:test runner. Prisma and CloudflareClient are replaced
 * by in-memory stubs so no database or network is required.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DomainService } from '../services/domain.service.js';
import type { DomainsModuleOptions, Domain } from '../types/domains.types.js';

// ---------------------------------------------------------------------------
// In-memory Prisma stub
// ---------------------------------------------------------------------------

function makePrismaStub() {
  const store = new Map<string, Domain>();
  let idCounter = 1;
  const nextId = () => `domain-${idCounter++}`;

  return {
    domain: {
      async findUnique({ where }: { where: { id?: string; domain?: string } }): Promise<Domain | null> {
        if (where.id) return store.get(where.id) ?? null;
        if (where.domain) {
          return [...store.values()].find((d) => d.domain === where.domain) ?? null;
        }
        return null;
      },
      async findMany({ where, take, skip }: { where: Record<string, unknown>; take?: number; skip?: number }): Promise<Domain[]> {
        let result = [...store.values()].filter((d) => {
          return Object.entries(where).every(([k, v]) => (d as Record<string, unknown>)[k] === v);
        });
        if (skip) result = result.slice(skip);
        if (take) result = result.slice(0, take);
        return result;
      },
      async create({ data }: { data: Record<string, unknown> }): Promise<Domain> {
        const id = nextId();
        const now = new Date();
        const record: Domain = {
          id,
          domain: data['domain'] as string,
          tenantId: data['tenantId'] as string,
          status: (data['status'] as Domain['status']) ?? 'pending',
          verifiedAt: null,
          sslStatus: (data['sslStatus'] as Domain['sslStatus']) ?? 'pending',
          txtVerificationRecord: data['txtVerificationRecord'] as string,
          cloudflareZoneId: (data['cloudflareZoneId'] as string | null) ?? null,
          cloudflareDnsRecordId: null,
          createdAt: now,
          updatedAt: now,
        };
        store.set(id, record);
        return record;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }): Promise<Domain> {
        const record = store.get(where.id);
        if (!record) throw new Error(`Domain ${where.id} not found`);
        const updated = { ...record, ...data, updatedAt: new Date() } as Domain;
        store.set(where.id, updated);
        return updated;
      },
      async delete({ where }: { where: { id: string } }): Promise<Domain> {
        const record = store.get(where.id);
        if (!record) throw new Error(`Domain ${where.id} not found`);
        store.delete(where.id);
        return record;
      },
    },
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// CloudflareClient stub
// ---------------------------------------------------------------------------

const TEST_ZONE_ID = 'cf-zone-test';
const TEST_RECORD_ID = 'cf-record-test';

function makeCloudflareStub(overrides: Partial<{
  findZoneForDomain: () => Promise<unknown>;
  createDnsRecord: () => Promise<unknown>;
  updateDnsRecord: () => Promise<unknown>;
  deleteDnsRecord: () => Promise<void>;
}> = {}) {
  return {
    async findZoneForDomain(_domain: string) {
      if (overrides.findZoneForDomain) return overrides.findZoneForDomain();
      return { id: TEST_ZONE_ID, name: 'acme.com', status: 'active', paused: false, type: 'full', nameServers: [] };
    },
    async createDnsRecord(_input: unknown) {
      if (overrides.createDnsRecord) return overrides.createDnsRecord();
      return { id: TEST_RECORD_ID, type: 'CNAME', name: 'app.acme.com', content: 'platform.unicore.io', ttl: 1, proxied: true, zoneId: TEST_ZONE_ID, zoneName: 'acme.com', createdOn: '', modifiedOn: '' };
    },
    async updateDnsRecord(_input: unknown) {
      if (overrides.updateDnsRecord) return overrides.updateDnsRecord();
      return { id: TEST_RECORD_ID, type: 'CNAME', name: 'app.acme.com', content: 'platform.unicore.io', ttl: 1, proxied: true, zoneId: TEST_ZONE_ID, zoneName: 'acme.com', createdOn: '', modifiedOn: '' };
    },
    async deleteDnsRecord(_zoneId: string, _recordId: string) {
      if (overrides.deleteDnsRecord) return overrides.deleteDnsRecord();
    },
  };
}

const MODULE_OPTIONS: DomainsModuleOptions = {
  cloudflare: {
    apiToken: 'test-token',
    platformHostname: 'platform.unicore.io',
  },
};

function makeService(prisma: ReturnType<typeof makePrismaStub>, cfStub = makeCloudflareStub()): DomainService {
  // DomainService constructor signature: (prisma, options, cloudflareClient)
  return new (DomainService as unknown as new (
    prisma: unknown,
    options: DomainsModuleOptions,
    cf: unknown,
  ) => DomainService)(prisma, MODULE_OPTIONS, cfStub);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DomainService', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let service: DomainService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = makeService(prisma);
  });

  // ─── addDomain ─────────────────────────────────────────────────────────────

  describe('addDomain', () => {
    it('creates a domain record with status=pending and a txt token', async () => {
      const result = await service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });

      assert.equal(result.domain, 'app.acme.com');
      assert.equal(result.tenantId, 'tenant-1');
      assert.equal(result.status, 'pending');
      assert.equal(result.sslStatus, 'pending');
      assert.match(result.txtVerificationRecord, /^unicore-verify=/);
      assert.equal(result.txtRecordName, '_unicore-verify.app.acme.com');
      assert.equal(result.cloudflareZoneId, TEST_ZONE_ID);
    });

    it('normalizes domain to lowercase and strips trailing dot', async () => {
      const result = await service.addDomain({ domain: 'APP.Acme.COM.', tenantId: 'tenant-1' });
      assert.equal(result.domain, 'app.acme.com');
    });

    it('throws ConflictException if domain already exists', async () => {
      await service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });

      await assert.rejects(
        () => service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-2' }),
        (err: Error) => {
          assert.match(err.message, /already registered/);
          return true;
        },
      );
    });

    it('stores domain even when Cloudflare zone lookup fails', async () => {
      const cfStub = makeCloudflareStub({
        findZoneForDomain: async () => { throw new Error('zone not found'); },
      });
      const svc = makeService(prisma, cfStub);

      const result = await svc.addDomain({ domain: 'nozone.example.com', tenantId: 'tenant-1' });
      assert.equal(result.cloudflareZoneId, null);
      assert.equal(result.status, 'pending');
    });
  });

  // ─── getDomain ─────────────────────────────────────────────────────────────

  describe('getDomain', () => {
    it('returns the domain response DTO', async () => {
      const added = await service.addDomain({ domain: 'shop.acme.com', tenantId: 'tenant-1' });
      const fetched = await service.getDomain(added.id);
      assert.equal(fetched.id, added.id);
      assert.equal(fetched.domain, 'shop.acme.com');
    });

    it('throws NotFoundException for unknown id', async () => {
      await assert.rejects(
        () => service.getDomain('non-existent-id'),
        (err: Error) => {
          assert.match(err.message, /not found/i);
          return true;
        },
      );
    });
  });

  // ─── listDomains ───────────────────────────────────────────────────────────

  describe('listDomains', () => {
    it('returns only domains belonging to the given tenant', async () => {
      await service.addDomain({ domain: 'a.acme.com', tenantId: 'tenant-1' });
      await service.addDomain({ domain: 'b.acme.com', tenantId: 'tenant-1' });
      await service.addDomain({ domain: 'c.other.com', tenantId: 'tenant-2' });

      const result = await service.listDomains({ tenantId: 'tenant-1' });
      assert.equal(result.length, 2);
      assert.ok(result.every((d) => d.tenantId === 'tenant-1'));
    });
  });

  // ─── configureDns ──────────────────────────────────────────────────────────

  describe('configureDns', () => {
    it('throws BadRequestException if domain is not verified', async () => {
      const added = await service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });
      // status is 'pending', not 'verified'
      await assert.rejects(
        () => service.configureDns(added.id),
        (err: Error) => {
          assert.match(err.message, /must be verified/);
          return true;
        },
      );
    });

    it('creates a CNAME record and sets status to active when domain is verified', async () => {
      const added = await service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });
      // Manually set status to 'verified' in the store
      await prisma.domain.update({ where: { id: added.id }, data: { status: 'verified', verifiedAt: new Date() } });

      const result = await service.configureDns(added.id);

      assert.equal(result.domain, 'app.acme.com');
      assert.equal(result.cnameTarget, 'platform.unicore.io');
      assert.equal(result.cloudflareZoneId, TEST_ZONE_ID);
      assert.equal(result.cloudflareDnsRecordId, TEST_RECORD_ID);
      assert.equal(result.proxied, true);

      // Check DB record updated
      const final = await service.getDomain(added.id);
      assert.equal(final.status, 'active');
      assert.equal(final.sslStatus, 'active');
    });
  });

  // ─── removeDomain ──────────────────────────────────────────────────────────

  describe('removeDomain', () => {
    it('deletes the domain from the database', async () => {
      const added = await service.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });
      await service.removeDomain(added.id);

      await assert.rejects(
        () => service.getDomain(added.id),
        (err: Error) => {
          assert.match(err.message, /not found/i);
          return true;
        },
      );
    });

    it('calls deleteDnsRecord when cloudflare IDs are present', async () => {
      let deleteCalledWith: [string, string] | null = null;
      const cfStub = makeCloudflareStub({
        deleteDnsRecord: async () => { deleteCalledWith = ['zone-x', 'rec-x']; },
      });
      const svc = makeService(prisma, cfStub);

      const added = await svc.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });
      await prisma.domain.update({
        where: { id: added.id },
        data: { cloudflareZoneId: 'zone-x', cloudflareDnsRecordId: 'rec-x' },
      });

      await svc.removeDomain(added.id);
      assert.notEqual(deleteCalledWith, null);
    });

    it('does not throw if Cloudflare deletion fails', async () => {
      const cfStub = makeCloudflareStub({
        deleteDnsRecord: async () => { throw new Error('record not found in CF'); },
      });
      const svc = makeService(prisma, cfStub);

      const added = await svc.addDomain({ domain: 'app.acme.com', tenantId: 'tenant-1' });
      await prisma.domain.update({
        where: { id: added.id },
        data: { cloudflareZoneId: 'zone-x', cloudflareDnsRecordId: 'rec-x' },
      });

      // Should resolve without throwing
      await assert.doesNotReject(() => svc.removeDomain(added.id));
    });
  });
});
