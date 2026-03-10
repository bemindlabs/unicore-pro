/**
 * VerificationService unit tests.
 *
 * Uses Node's built-in test runner (node:test).  No NestJS container, real
 * database, or DNS calls are needed — all dependencies are stubbed in-memory.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { VerificationService } from '../services/verification.service.js';
import { DnsLookupService } from '../services/dns-lookup.service.js';
import {
  VerificationStatus,
  VerificationError,
  DEFAULT_VERIFICATION_CONFIG,
} from '../types/verification.types.js';
import type {
  VerificationRecord,
  VerificationResult,
  DomainVerifiedEvent,
  DomainVerificationFailedEvent,
} from '../types/verification.types.js';

// ─── In-memory Prisma stub ────────────────────────────────────────────────────

type PrismaStub = {
  domainVerification: {
    create(args: { data: Record<string, unknown> }): Promise<VerificationRecord>;
    findUnique(args: { where: Record<string, unknown> }): Promise<VerificationRecord | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<VerificationRecord | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<VerificationRecord>;
  };
  _store: Map<string, VerificationRecord>;
};

function makePrismaStub(): PrismaStub {
  const store = new Map<string, VerificationRecord>();
  let counter = 1;

  return {
    domainVerification: {
      async create(args): Promise<VerificationRecord> {
        const now = new Date();
        const d = args.data;
        const record: VerificationRecord = {
          id: `vr-${counter++}`,
          domainId: d['domainId'] as string,
          domain: d['domain'] as string,
          txtRecord: d['txtRecord'] as string,
          status: (d['status'] as VerificationRecord['status']) ?? VerificationStatus.PENDING,
          attempts: (d['attempts'] as number) ?? 0,
          maxAttempts: (d['maxAttempts'] as number) ?? DEFAULT_VERIFICATION_CONFIG.maxAttempts,
          lastCheckedAt: (d['lastCheckedAt'] as Date | null) ?? null,
          verifiedAt: (d['verifiedAt'] as Date | null) ?? null,
          activatedAt: (d['activatedAt'] as Date | null) ?? null,
          rateLimitResetAt: (d['rateLimitResetAt'] as Date | null) ?? null,
          startCount: (d['startCount'] as number) ?? 0,
          createdAt: (d['createdAt'] as Date) ?? now,
          updatedAt: (d['updatedAt'] as Date) ?? now,
        };
        store.set(record.id, record);
        return record;
      },

      async findUnique(args): Promise<VerificationRecord | null> {
        const id = args.where['id'] as string;
        return store.get(id) ?? null;
      },

      async findFirst(args): Promise<VerificationRecord | null> {
        const domainId = args.where['domainId'] as string | undefined;
        const results = [...store.values()].filter(
          (r) => !domainId || r.domainId === domainId,
        );
        // Simulate "orderBy createdAt desc" — last inserted wins
        return results.at(-1) ?? null;
      },

      async update(args): Promise<VerificationRecord> {
        const id = args.where['id'] as string;
        const existing = store.get(id);
        if (!existing) throw new Error(`Record ${id} not found in stub`);
        const updated: VerificationRecord = {
          ...existing,
          ...(args.data as Partial<VerificationRecord>),
          updatedAt: new Date(),
        };
        store.set(id, updated);
        return updated;
      },
    },
    _store: store,
  };
}

// ─── DNS stub ─────────────────────────────────────────────────────────────────

function makeDnsStub(
  txtRecordsToReturn: string[] = [],
  errorToThrow?: Error,
): DnsLookupService {
  return {
    resolveTxt: async (_domain: string): Promise<string[]> => {
      if (errorToThrow) throw errorToThrow;
      return txtRecordsToReturn;
    },
    checkVerificationRecord: async (
      _domain: string,
      expectedRecord: string,
    ): Promise<VerificationResult> => {
      if (errorToThrow) {
        return {
          found: false,
          txtRecordsFound: [],
          expectedRecord,
          matched: false,
          checkedAt: new Date(),
          error: errorToThrow.message,
        };
      }
      const matched = txtRecordsToReturn.some((r) => r === expectedRecord);
      return {
        found: txtRecordsToReturn.length > 0,
        txtRecordsFound: txtRecordsToReturn,
        expectedRecord,
        matched,
        checkedAt: new Date(),
      };
    },
  } as unknown as DnsLookupService;
}

// ─── Service factory ─────────────────────────────────────────────────────────

type ServiceOpts = {
  maxAttempts?: number;
  maxStartsPerHour?: number;
  txtRecordPrefix?: string;
  exponentialBackoff?: boolean;
  pollIntervalMs?: number;
};

type ServiceBundle = {
  service: VerificationService;
  prisma: PrismaStub;
};

function makeBundle(dns: DnsLookupService, opts: ServiceOpts = {}): ServiceBundle {
  const prisma = makePrismaStub();
  // Construct VerificationService without NestJS DI — inject stubs directly.
  const domainOpts = {
    cloudflare: { apiToken: '', platformHostname: '' },
    ...opts,
  };
  const svc = new (VerificationService as unknown as new (
    p: PrismaStub,
    d: DnsLookupService,
    o: typeof domainOpts,
  ) => VerificationService)(prisma, dns, domainOpts);
  return { service: svc, prisma };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VerificationService', () => {

  // ── generateVerificationRecord ──────────────────────────────────────────────

  describe('generateVerificationRecord()', () => {
    it('produces a value with the default prefix', () => {
      const { service } = makeBundle(makeDnsStub());
      const val = service.generateVerificationRecord();
      assert.ok(
        val.startsWith(`${DEFAULT_VERIFICATION_CONFIG.txtRecordPrefix}=`),
        `Got: ${val}`,
      );
    });

    it('accepts a custom prefix override', () => {
      const { service } = makeBundle(makeDnsStub());
      const val = service.generateVerificationRecord('custom-prefix');
      assert.ok(val.startsWith('custom-prefix='));
    });

    it('produces unique values on each call', () => {
      const { service } = makeBundle(makeDnsStub());
      const a = service.generateVerificationRecord();
      const b = service.generateVerificationRecord();
      assert.notEqual(a, b);
    });
  });

  // ── startVerification ───────────────────────────────────────────────────────

  describe('startVerification()', () => {
    it('creates a PENDING record', async () => {
      const { service } = makeBundle(makeDnsStub());
      const rec = await service.startVerification('dom-1', 'example.com');

      assert.equal(rec.status, VerificationStatus.PENDING);
      assert.equal(rec.domainId, 'dom-1');
      assert.equal(rec.domain, 'example.com');
      assert.ok(rec.txtRecord.includes('='));
      assert.equal(rec.attempts, 0);
      assert.equal(rec.startCount, 1);
      assert.ok(rec.rateLimitResetAt instanceof Date);
    });

    it('enforces rate limit after maxStartsPerHour', async () => {
      const { service } = makeBundle(makeDnsStub(), { maxStartsPerHour: 2 });

      await service.startVerification('dom-rl', 'rl.com');
      await service.startVerification('dom-rl', 'rl.com');

      await assert.rejects(
        () => service.startVerification('dom-rl', 'rl.com'),
        (err: unknown) => {
          assert.ok(err instanceof VerificationError, `Expected VerificationError, got ${err}`);
          assert.equal((err as VerificationError).code, 'RATE_LIMITED');
          return true;
        },
      );
    });

    it('resets rate-limit counter after window expires', async () => {
      const { service, prisma } = makeBundle(makeDnsStub(), { maxStartsPerHour: 1 });

      await service.startVerification('dom-exp', 'exp.com');

      // Move the rate-limit window into the past
      const rec = [...prisma._store.values()].at(-1)!;
      prisma._store.set(rec.id, {
        ...rec,
        rateLimitResetAt: new Date(Date.now() - 1_000),
      });

      // Should now succeed
      const fresh = await service.startVerification('dom-exp', 'exp.com');
      assert.equal(fresh.status, VerificationStatus.PENDING);
    });
  });

  // ── checkVerification ───────────────────────────────────────────────────────

  describe('checkVerification()', () => {
    it('transitions PENDING -> VERIFYING when record not found', async () => {
      const { service } = makeBundle(makeDnsStub([])); // no TXT records
      const created = await service.startVerification('dom-2', 'pending.com');
      const updated = await service.checkVerification(created.id);

      assert.equal(updated.status, VerificationStatus.VERIFYING);
      assert.equal(updated.attempts, 1);
      assert.ok(updated.lastCheckedAt instanceof Date);
    });

    it('transitions VERIFYING -> VERIFIED when TXT record matches', async () => {
      // Create with no-match DNS first
      const { service: svcCreate, prisma } = makeBundle(makeDnsStub([]));
      const created = await svcCreate.startVerification('dom-3', 'verify.com');

      // Now use matching DNS
      const { service: svcCheck } = makeBundle(makeDnsStub([created.txtRecord]));
      // Seed the matching service's prisma store with the created record
      const svcCheckPrisma = (svcCheck as unknown as { prisma: PrismaStub }).prisma;
      svcCheckPrisma._store.set(created.id, created);

      const verified = await svcCheck.checkVerification(created.id);
      assert.equal(verified.status, VerificationStatus.VERIFIED);
      assert.ok(verified.verifiedAt instanceof Date);
    });

    it('invokes onVerified callback on match', async () => {
      let event: DomainVerifiedEvent | null = null;

      const { service: svcCreate } = makeBundle(makeDnsStub([]));
      const created = await svcCreate.startVerification('dom-4', 'cb-ok.com');

      const { service: svcCheck } = makeBundle(makeDnsStub([created.txtRecord]));
      const svcCheckPrisma = (svcCheck as unknown as { prisma: PrismaStub }).prisma;
      svcCheckPrisma._store.set(created.id, created);

      await svcCheck.checkVerification(
        created.id,
        (e) => { event = e; },
      );

      assert.ok(event !== null, 'onVerified was not called');
      assert.equal((event as DomainVerifiedEvent).domainId, 'dom-4');
      assert.equal((event as DomainVerifiedEvent).domain, 'cb-ok.com');
    });

    it('transitions -> FAILED after maxAttempts with no match', async () => {
      const { service } = makeBundle(makeDnsStub([]), { maxAttempts: 2 });
      const created = await service.startVerification('dom-5', 'fail.com');

      await service.checkVerification(created.id); // attempt 1: PENDING -> VERIFYING
      const failed = await service.checkVerification(created.id); // attempt 2: -> FAILED

      assert.equal(failed.status, VerificationStatus.FAILED);
    });

    it('invokes onFailed callback when maxAttempts reached', async () => {
      let failedEvent: DomainVerificationFailedEvent | null = null;

      const { service } = makeBundle(makeDnsStub([]), { maxAttempts: 1 });
      const created = await service.startVerification('dom-6', 'fail-cb.com');

      await service.checkVerification(created.id, undefined, (e) => { failedEvent = e; });

      assert.ok(failedEvent !== null, 'onFailed was not called');
      assert.equal((failedEvent as DomainVerificationFailedEvent).attempts, 1);
    });

    it('is a no-op for ACTIVE records', async () => {
      const { service } = makeBundle(makeDnsStub([]));
      const created = await service.startVerification('dom-7', 'active.com');
      const svcPrisma = (service as unknown as { prisma: PrismaStub }).prisma;
      svcPrisma._store.set(created.id, { ...created, status: VerificationStatus.ACTIVE });

      const result = await service.checkVerification(created.id);
      assert.equal(result.status, VerificationStatus.ACTIVE);
      assert.equal(result.attempts, 0); // unchanged
    });

    it('throws NOT_FOUND for unknown verificationId', async () => {
      const { service } = makeBundle(makeDnsStub());
      await assert.rejects(
        () => service.checkVerification('does-not-exist'),
        (err: unknown) => {
          assert.ok(err instanceof VerificationError);
          assert.equal((err as VerificationError).code, 'NOT_FOUND');
          return true;
        },
      );
    });
  });

  // ── activateVerification ────────────────────────────────────────────────────

  describe('activateVerification()', () => {
    it('transitions VERIFIED -> ACTIVE', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-8', 'activate.com');
      const svcPrisma = (service as unknown as { prisma: PrismaStub }).prisma;
      svcPrisma._store.set(created.id, { ...created, status: VerificationStatus.VERIFIED });

      const activated = await service.activateVerification(created.id);
      assert.equal(activated.status, VerificationStatus.ACTIVE);
      assert.ok(activated.activatedAt instanceof Date);
    });

    it('throws ALREADY_ACTIVE for already-active records', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-9', 'active2.com');
      const svcPrisma = (service as unknown as { prisma: PrismaStub }).prisma;
      svcPrisma._store.set(created.id, { ...created, status: VerificationStatus.ACTIVE });

      await assert.rejects(
        () => service.activateVerification(created.id),
        (err: unknown) => {
          assert.ok(err instanceof VerificationError);
          assert.equal((err as VerificationError).code, 'ALREADY_ACTIVE');
          return true;
        },
      );
    });

    it('throws INVALID_TRANSITION when status is not VERIFIED', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-10', 'inv.com');
      // Still PENDING — activation not allowed

      await assert.rejects(
        () => service.activateVerification(created.id),
        (err: unknown) => {
          assert.ok(err instanceof VerificationError);
          assert.equal((err as VerificationError).code, 'INVALID_TRANSITION');
          return true;
        },
      );
    });
  });

  // ── cancelVerification ──────────────────────────────────────────────────────

  describe('cancelVerification()', () => {
    it('transitions PENDING -> CANCELLED', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-11', 'cancel.com');
      const result = await service.cancelVerification(created.id);
      assert.equal(result.status, VerificationStatus.CANCELLED);
    });

    it('transitions VERIFYING -> CANCELLED', async () => {
      const { service } = makeBundle(makeDnsStub([]));
      const created = await service.startVerification('dom-12', 'cancel2.com');
      await service.checkVerification(created.id); // PENDING -> VERIFYING

      const current = await service.getVerification(created.id);
      assert.equal(current?.status, VerificationStatus.VERIFYING);

      const cancelled = await service.cancelVerification(created.id);
      assert.equal(cancelled.status, VerificationStatus.CANCELLED);
    });

    it('throws INVALID_TRANSITION when trying to cancel an ACTIVE record', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-13', 'cancel3.com');
      const svcPrisma = (service as unknown as { prisma: PrismaStub }).prisma;
      svcPrisma._store.set(created.id, { ...created, status: VerificationStatus.ACTIVE });

      await assert.rejects(
        () => service.cancelVerification(created.id),
        (err: unknown) => {
          assert.ok(err instanceof VerificationError);
          assert.equal((err as VerificationError).code, 'INVALID_TRANSITION');
          return true;
        },
      );
    });
  });

  // ── getVerification / getLatestForDomain ────────────────────────────────────

  describe('getVerification()', () => {
    it('returns null for unknown ID', async () => {
      const { service } = makeBundle(makeDnsStub());
      const result = await service.getVerification('no-such-id');
      assert.equal(result, null);
    });

    it('returns the record for a known ID', async () => {
      const { service } = makeBundle(makeDnsStub());
      const created = await service.startVerification('dom-14', 'get.com');
      const found = await service.getVerification(created.id);
      assert.ok(found !== null);
      assert.equal(found.id, created.id);
    });
  });

  describe('getLatestForDomain()', () => {
    it('returns null for an unknown domain', async () => {
      const { service } = makeBundle(makeDnsStub());
      const result = await service.getLatestForDomain('unknown-domain-id');
      assert.equal(result, null);
    });

    it('returns a record when one exists', async () => {
      const { service } = makeBundle(makeDnsStub(), { maxStartsPerHour: 10 });
      await service.startVerification('dom-15', 'latest.com');
      const result = await service.getLatestForDomain('dom-15');
      assert.ok(result !== null);
      assert.equal(result.domainId, 'dom-15');
    });
  });
});

// ─── DnsLookupService tests ───────────────────────────────────────────────────

describe('DnsLookupService', () => {
  it('checkVerificationRecord returns matched=true when record is found', async () => {
    // We cannot make real DNS calls in tests, so we test the service logic
    // by creating a subclass that overrides resolveTxt.
    class StubDns extends DnsLookupService {
      override async resolveTxt(_domain: string): Promise<string[]> {
        return ['unicore-verify=abc123'];
      }
    }
    const svc = new StubDns();
    const result = await svc.checkVerificationRecord('example.com', 'unicore-verify=abc123');

    assert.equal(result.matched, true);
    assert.equal(result.found, true);
    assert.equal(result.error, undefined);
  });

  it('checkVerificationRecord returns matched=false when record absent', async () => {
    class StubDns extends DnsLookupService {
      override async resolveTxt(_domain: string): Promise<string[]> {
        return ['something-else=xyz'];
      }
    }
    const svc = new StubDns();
    const result = await svc.checkVerificationRecord('example.com', 'unicore-verify=abc123');

    assert.equal(result.matched, false);
    assert.equal(result.found, true);
  });

  it('checkVerificationRecord returns found=false for empty DNS response', async () => {
    class StubDns extends DnsLookupService {
      override async resolveTxt(_domain: string): Promise<string[]> {
        return [];
      }
    }
    const svc = new StubDns();
    const result = await svc.checkVerificationRecord('example.com', 'unicore-verify=abc');

    assert.equal(result.matched, false);
    assert.equal(result.found, false);
  });

  it('checkVerificationRecord captures error and returns error string', async () => {
    class StubDns extends DnsLookupService {
      override async resolveTxt(_domain: string): Promise<string[]> {
        throw new Error('ECONNREFUSED');
      }
    }
    const svc = new StubDns();
    const result = await svc.checkVerificationRecord('example.com', 'unicore-verify=abc');

    assert.equal(result.matched, false);
    assert.ok(typeof result.error === 'string');
    assert.ok(result.error.includes('ECONNREFUSED'));
  });
});
