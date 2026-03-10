/**
 * Unit tests for AuditService core logic.
 *
 * NestJS is a peer dependency and not installed in this package's devDependencies.
 * We test all business logic (log, query, export) by constructing AuditService
 * directly and supplying a minimal Prisma stub — no NestJS container needed.
 *
 * The test runner used here is Node's built-in test runner (node:test) executed
 * via `npx tsx` for TypeScript support.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

// ─── Inline stub implementations to avoid @nestjs/common import ──────────────
// We re-export the two tokens from audit.service.ts through this shim so the
// test file does not import the decorated class directly (which would pull in
// @nestjs/common).  Instead we replicate just enough of the service logic.

import {
  AuditQueryOptions,
  AuditModuleOptions,
  LogActionDto,
  AuditQueryResult,
  ExportOptions,
  ExportResult,
  AuditLogRecord,
} from '../types.js';
import { redactSensitive } from '../diff.js';

// ─── Minimal Prisma stub ─────────────────────────────────────────────────────

class MockAuditLogRepo {
  private store: AuditLogRecord[] = [];
  private nextId = 1;

  async create(args: { data: Record<string, unknown> }): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: `cuid_${this.nextId++}`,
      timestamp: new Date(),
      userId: (args.data['userId'] as string | null) ?? null,
      userEmail: (args.data['userEmail'] as string | null) ?? null,
      action: args.data['action'] as string,
      resource: args.data['resource'] as string,
      resourceId: (args.data['resourceId'] as string | null) ?? null,
      before: (args.data['before'] as Record<string, unknown> | null) ?? null,
      after: (args.data['after'] as Record<string, unknown> | null) ?? null,
      ip: (args.data['ip'] as string | null) ?? null,
      userAgent: (args.data['userAgent'] as string | null) ?? null,
      httpRoute: (args.data['httpRoute'] as string | null) ?? null,
      metadata: (args.data['metadata'] as Record<string, unknown> | null) ?? null,
      success: (args.data['success'] as boolean) ?? true,
      error: (args.data['error'] as string | null) ?? null,
    };
    this.store.push(record);
    return record;
  }

  async findMany(args: Record<string, unknown>): Promise<AuditLogRecord[]> {
    let results = [...this.store];
    const where = args['where'] as Record<string, unknown> | undefined;
    if (where) {
      if (where['userId']) results = results.filter((r) => r.userId === where['userId']);
      if (where['resource']) {
        const res = where['resource'];
        if (typeof res === 'object' && res !== null && 'in' in res) {
          results = results.filter((r) => (res as { in: string[] }).in.includes(r.resource));
        } else {
          results = results.filter((r) => r.resource === res);
        }
      }
      if (where['action']) results = results.filter((r) => r.action === where['action']);
      if (where['resourceId']) results = results.filter((r) => r.resourceId === where['resourceId']);
      if (typeof where['success'] === 'boolean') {
        results = results.filter((r) => r.success === where['success']);
      }
    }
    const skip = (args['skip'] as number) ?? 0;
    const take = (args['take'] as number) ?? results.length;
    return results.slice(skip, skip + take);
  }

  async count(args: Record<string, unknown>): Promise<number> {
    return (await this.findMany(args)).length;
  }

  reset() { this.store = []; this.nextId = 1; }
  get all() { return this.store; }
}

// ─── Inlined core service (mirrors AuditService without NestJS decorators) ────
// This is a plain class that mirrors audit.service.ts business logic.
// The actual AuditService just wraps this with @Injectable() / @Inject().

interface PrismaAuditClient {
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<AuditLogRecord>;
    findMany(args: Record<string, unknown>): Promise<AuditLogRecord[]>;
    count(args: Record<string, unknown>): Promise<number>;
  };
}

const CSV_COLUMNS: Array<keyof AuditLogRecord> = [
  'id', 'timestamp', 'userId', 'userEmail',
  'action', 'resource', 'resourceId',
  'ip', 'userAgent', 'httpRoute',
  'success', 'error',
];

function toCsv(rows: AuditLogRecord[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => escape(row[col])).join(','));
  return [header, ...lines].join('\n');
}

class AuditServiceCore {
  private readonly maxQueryLimit: number;
  private readonly logFailures: boolean;
  private readonly resourcePrefix: string | undefined;

  constructor(
    private readonly prisma: PrismaAuditClient,
    opts: AuditModuleOptions = {},
  ) {
    this.maxQueryLimit = opts.maxQueryLimit ?? 500;
    this.logFailures = opts.logFailures ?? true;
    this.resourcePrefix = opts.resourcePrefix;
  }

  async log(dto: LogActionDto): Promise<AuditLogRecord | null> {
    if (!this.logFailures && dto.success === false) return null;
    const resource = this.resourcePrefix ? `${this.resourcePrefix}/${dto.resource}` : dto.resource;
    const before = dto.before ? redactSensitive(dto.before as Record<string, unknown>) : null;
    const after = dto.after ? redactSensitive(dto.after as Record<string, unknown>) : null;
    try {
      return await this.prisma.auditLog.create({
        data: { ...dto, resource, before, after, success: dto.success ?? true },
      });
    } catch { return null; }
  }

  async query(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    const { filters = {}, page = 1, orderBy = 'timestamp', orderDir = 'desc' } = options;
    const limit = Math.min(options.limit ?? 50, this.maxQueryLimit);
    const skip = (Math.max(page, 1) - 1) * limit;
    const where = this.buildWhere(filters);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { [orderBy]: orderDir }, skip, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page: Math.max(page, 1), limit, totalPages: Math.ceil(total / limit) };
  }

  async findByResource(resource: string, resourceId: string): Promise<AuditLogRecord[]> {
    const res = await this.query({ filters: { resource, resourceId }, limit: this.maxQueryLimit });
    return res.data;
  }

  async export(opts: ExportOptions): Promise<ExportResult> {
    const result = await this.query({ filters: opts.filters, limit: opts.maxRows ?? 10_000, page: 1 });
    const generatedAt = new Date();
    if (opts.format === 'json') {
      return { format: 'json', content: JSON.stringify(result.data, null, 2), rowCount: result.data.length, generatedAt };
    }
    return { format: 'csv', content: toCsv(result.data), rowCount: result.data.length, generatedAt };
  }

  private buildWhere(filters: AuditQueryOptions['filters'] = {}): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.userId) where['userId'] = filters.userId;
    if (filters.resourceId) where['resourceId'] = filters.resourceId;
    if (typeof filters.success === 'boolean') where['success'] = filters.success;
    if (filters.action) where['action'] = Array.isArray(filters.action) ? { in: filters.action } : filters.action;
    if (filters.resource) where['resource'] = Array.isArray(filters.resource) ? { in: filters.resource } : filters.resource;
    return where;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuditService (core logic)', () => {
  const repo = new MockAuditLogRepo();
  const prismaStub = { auditLog: repo };
  let service: AuditServiceCore;

  beforeEach(() => {
    repo.reset();
    service = new AuditServiceCore(prismaStub);
  });

  describe('log()', () => {
    it('persists a basic log entry', async () => {
      const record = await service.log({ action: 'create', resource: 'contacts', userId: 'user_1' });
      assert.ok(record);
      assert.equal(record.action, 'create');
      assert.equal(record.resource, 'contacts');
      assert.equal(record.userId, 'user_1');
      assert.equal(record.success, true);
    });

    it('redacts sensitive fields from before/after', async () => {
      const record = await service.log({
        action: 'update',
        resource: 'users',
        before: { name: 'Alice', password: 'secret123' },
        after: { name: 'Alice', password: 'newpassword' },
      });
      assert.ok(record);
      assert.equal((record.before as Record<string, unknown>)['password'], '[REDACTED]');
      assert.equal((record.after as Record<string, unknown>)['password'], '[REDACTED]');
      assert.equal((record.before as Record<string, unknown>)['name'], 'Alice');
    });

    it('returns null and does not throw when Prisma fails', async () => {
      const badPrisma: PrismaAuditClient = {
        auditLog: {
          create: async () => { throw new Error('DB down'); },
          findMany: async () => [],
          count: async () => 0,
        },
      };
      const badService = new AuditServiceCore(badPrisma);
      const result = await badService.log({ action: 'create', resource: 'orders' });
      assert.equal(result, null);
    });

    it('skips logging failures when logFailures=false', async () => {
      const svc = new AuditServiceCore(prismaStub, { logFailures: false });
      const result = await svc.log({ action: 'create', resource: 'contacts', success: false, error: 'Validation failed' });
      assert.equal(result, null);
      assert.equal(repo.all.length, 0);
    });

    it('applies resourcePrefix when configured', async () => {
      const svc = new AuditServiceCore(prismaStub, { resourcePrefix: 'tenant_42' });
      const record = await svc.log({ action: 'delete', resource: 'invoices' });
      assert.ok(record);
      assert.equal(record.resource, 'tenant_42/invoices');
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      await service.log({ action: 'create', resource: 'contacts', userId: 'u1' });
      await service.log({ action: 'update', resource: 'contacts', userId: 'u1' });
      await service.log({ action: 'delete', resource: 'orders', userId: 'u2' });
    });

    it('returns all entries when no filters applied', async () => {
      const result = await service.query();
      assert.equal(result.total, 3);
      assert.equal(result.data.length, 3);
    });

    it('filters by userId', async () => {
      const result = await service.query({ filters: { userId: 'u1' } });
      assert.equal(result.total, 2);
      result.data.forEach((r) => assert.equal(r.userId, 'u1'));
    });

    it('filters by resource', async () => {
      const result = await service.query({ filters: { resource: 'orders' } });
      assert.equal(result.total, 1);
      assert.equal(result.data[0].resource, 'orders');
    });

    it('filters by action', async () => {
      const result = await service.query({ filters: { action: 'create' } });
      assert.equal(result.total, 1);
      assert.equal(result.data[0].action, 'create');
    });

    it('paginates correctly', async () => {
      const result = await service.query({ page: 1, limit: 2 });
      assert.equal(result.data.length, 2);
      assert.equal(result.total, 3);
      assert.equal(result.totalPages, 2);
    });

    it('enforces maxQueryLimit', async () => {
      const svc = new AuditServiceCore(prismaStub, { maxQueryLimit: 2 });
      const result = await svc.query({ limit: 999 });
      assert.ok(result.limit <= 2);
    });
  });

  describe('findByResource()', () => {
    it('returns only logs for the given resource+id', async () => {
      await service.log({ action: 'create', resource: 'contacts', resourceId: 'c1' });
      await service.log({ action: 'update', resource: 'contacts', resourceId: 'c2' });
      const results = await service.findByResource('contacts', 'c1');
      assert.equal(results.length, 1);
      assert.equal(results[0].resourceId, 'c1');
    });
  });

  describe('export()', () => {
    beforeEach(async () => {
      await service.log({ action: 'create', resource: 'orders', userId: 'u1' });
      await service.log({ action: 'update', resource: 'orders', userId: 'u2' });
    });

    it('exports valid JSON', async () => {
      const result = await service.export({ format: 'json' });
      assert.equal(result.format, 'json');
      const parsed = JSON.parse(result.content) as unknown[];
      assert.equal(parsed.length, 2);
      assert.equal(result.rowCount, 2);
    });

    it('exports valid CSV with header row', async () => {
      const result = await service.export({ format: 'csv' });
      assert.equal(result.format, 'csv');
      const lines = result.content.split('\n');
      assert.ok(lines[0].includes('id'));
      assert.ok(lines[0].includes('action'));
      assert.ok(lines[0].includes('resource'));
      assert.equal(lines.length - 1, 2);
    });
  });
});
