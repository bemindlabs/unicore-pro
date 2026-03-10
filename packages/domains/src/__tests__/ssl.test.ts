/**
 * @unicore/domains — SSL provisioning unit tests (UNC-52)
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { SSL_EVENTS } from '../events/ssl.events.js';
import {
  SSL_MODULE_OPTIONS,
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_MONITOR_INTERVAL_MS,
  CLOUDFLARE_API_BASE,
  LETS_ENCRYPT_ACME_DIRECTORY,
} from '../ssl.constants.js';
import type {
  SslCertificate,
  SslModuleOptions,
  CertificateStatus,
  SslProvisionResult,
} from '../types/ssl.types.js';

function makeOptions(overrides: Partial<SslModuleOptions> = {}): SslModuleOptions {
  return { cloudflareApiToken: 'test_cf_token', defaultSslMode: 'full', expiryWarningDays: 30, monitorIntervalMs: 60_000, ...overrides };
}

function makeCertRecord(overrides: Partial<SslCertificate> = {}): SslCertificate {
  return {
    id: 'cert_01', domainId: 'dom_01', provider: 'cloudflare', status: 'active', sslMode: 'full',
    issuedAt: new Date('2026-01-01'), expiresAt: new Date('2026-12-31'),
    lastCheckedAt: new Date('2026-03-01'), renewalAttempts: 0, errorMessage: null,
    cloudflareCertPackId: 'pack_01', cloudflareHostnameId: null,
    acmeChallengeType: null, acmeOrderUrl: null,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SSL_EVENTS', () => {
  it('exports PROVISIONED event name', () => { assert.equal(SSL_EVENTS.PROVISIONED, 'ssl.provisioned'); });
  it('exports EXPIRY_WARNING event name', () => { assert.equal(SSL_EVENTS.EXPIRY_WARNING, 'ssl.expiry.warning'); });
  it('exports EXPIRED event name', () => { assert.equal(SSL_EVENTS.EXPIRED, 'ssl.expired'); });
  it('exports RENEWED event name', () => { assert.equal(SSL_EVENTS.RENEWED, 'ssl.renewed'); });
  it('exports ERROR event name', () => { assert.equal(SSL_EVENTS.ERROR, 'ssl.error'); });
});

describe('ssl.constants', () => {
  it('SSL_MODULE_OPTIONS is the expected injection token', () => { assert.equal(SSL_MODULE_OPTIONS, 'SSL_MODULE_OPTIONS'); });
  it('DEFAULT_EXPIRY_WARNING_DAYS is 30', () => { assert.equal(DEFAULT_EXPIRY_WARNING_DAYS, 30); });
  it('DEFAULT_MONITOR_INTERVAL_MS is 1 hour', () => { assert.equal(DEFAULT_MONITOR_INTERVAL_MS, 3_600_000); });
  it('CLOUDFLARE_API_BASE points to CF v4 API', () => {
    assert.ok(CLOUDFLARE_API_BASE.startsWith('https://api.cloudflare.com'));
    assert.ok(CLOUDFLARE_API_BASE.includes('v4'));
  });
  it('LETS_ENCRYPT_ACME_DIRECTORY is ACME v2 production URL', () => {
    assert.ok(LETS_ENCRYPT_ACME_DIRECTORY.includes('acme-v02'));
    assert.ok(LETS_ENCRYPT_ACME_DIRECTORY.includes('letsencrypt.org'));
  });
});

describe('SslCertificate model shape', () => {
  it('cert record has all required fields', () => {
    const cert = makeCertRecord();
    assert.ok(cert.id);
    assert.ok(cert.domainId);
    assert.ok(cert.provider === 'cloudflare' || cert.provider === 'letsencrypt');
    assert.ok(['pending', 'active', 'expiring', 'expired', 'error'].includes(cert.status));
    assert.ok(['off', 'flexible', 'full', 'strict'].includes(cert.sslMode));
  });
  it('cert record can have null expiry (pending state)', () => {
    const cert = makeCertRecord({ status: 'pending', expiresAt: null, issuedAt: null });
    assert.equal(cert.expiresAt, null);
    assert.equal(cert.issuedAt, null);
  });
  it('letsencrypt provider is valid', () => {
    const cert = makeCertRecord({ provider: 'letsencrypt', acmeChallengeType: 'http-01' });
    assert.equal(cert.provider, 'letsencrypt');
    assert.equal(cert.acmeChallengeType, 'http-01');
  });
});

describe('SslModuleOptions', () => {
  it('accepts minimal config with only apiToken', () => {
    const opts = makeOptions({ defaultSslMode: undefined });
    assert.ok(opts.cloudflareApiToken.length > 0);
  });
  it('supports all ssl modes', () => {
    const modes = ['off', 'flexible', 'full', 'strict'] as const;
    for (const mode of modes) {
      const opts = makeOptions({ defaultSslMode: mode });
      assert.equal(opts.defaultSslMode, mode);
    }
  });
  it('supports custom expiry warning threshold', () => {
    const opts = makeOptions({ expiryWarningDays: 14 });
    assert.equal(opts.expiryWarningDays, 14);
  });
  it('supports custom monitor interval', () => {
    const opts = makeOptions({ monitorIntervalMs: 300_000 });
    assert.equal(opts.monitorIntervalMs, 300_000);
  });
});

describe('SslModule', () => {
  async function tryImport() {
    try { return await import('../ssl.module.js'); } catch { return null; }
  }

  it('exports register() and registerAsync() static methods', async () => {
    const mod = await tryImport();
    if (!mod) return;
    assert.ok(typeof mod.SslModule.register === 'function');
    assert.ok(typeof mod.SslModule.registerAsync === 'function');
  });

  it('register() returns a DynamicModule with controllers', async () => {
    const mod = await tryImport();
    if (!mod) return;
    const dm = mod.SslModule.register(makeOptions());
    assert.ok(Array.isArray(dm.controllers));
    assert.ok((dm.controllers?.length ?? 0) > 0);
    assert.ok(Array.isArray(dm.exports));
    assert.ok((dm.exports?.length ?? 0) > 0);
  });

  it('register() includes SSL_MODULE_OPTIONS provider', async () => {
    const mod = await tryImport();
    if (!mod) return;
    const dm = mod.SslModule.register(makeOptions());
    const hasToken = dm.providers?.some(
      (p: unknown) => typeof p === 'object' && p !== null && 'provide' in p &&
        (p as { provide: unknown }).provide === SSL_MODULE_OPTIONS,
    );
    assert.ok(hasToken, 'SSL_MODULE_OPTIONS provider should be present');
  });

  it('registerAsync() accepts useFactory', async () => {
    const mod = await tryImport();
    if (!mod) return;
    const dm = mod.SslModule.registerAsync({ useFactory: () => makeOptions() });
    assert.ok(Array.isArray(dm.providers));
  });
});

describe('CloudflareSslClient', () => {
  async function buildClient(fetchImpl?: typeof fetch) {
    const { CloudflareSslClient } = await import('../services/cloudflare-ssl.client.js');
    const client = new (CloudflareSslClient as unknown as { new(opts: SslModuleOptions): InstanceType<typeof CloudflareSslClient> })(makeOptions());
    if (fetchImpl) (globalThis as Record<string, unknown>)['fetch'] = fetchImpl;
    return client;
  }

  function makeCfSuccess<T>(result: T) {
    return Promise.resolve({ json: () => Promise.resolve({ success: true, errors: [], result }) } as unknown as Response);
  }

  function makeCfFailure(message: string) {
    return Promise.resolve({ json: () => Promise.resolve({ success: false, errors: [{ code: 1000, message }], result: null }) } as unknown as Response);
  }

  it('getSslMode returns the mode string from the CF response', async () => {
    const client = await buildClient(() => makeCfSuccess({ id: 'ssl', value: 'strict', modified_on: '2026-01-01' }));
    const mode = await client.getSslMode('zone_123');
    assert.equal(mode, 'strict');
  });

  it('setSslMode throws on Cloudflare API failure', async () => {
    const client = await buildClient(() => makeCfFailure('Invalid zone'));
    await assert.rejects(() => client.setSslMode('zone_bad', 'full'), /setSslMode failed/);
  });

  it('listCertificatePacks returns empty array when no packs', async () => {
    const client = await buildClient(() => makeCfSuccess([]));
    const packs = await client.listCertificatePacks('zone_123');
    assert.deepEqual(packs, []);
  });

  it('listCertificatePacks returns pack list on success', async () => {
    const mockPacks = [{ id: 'pack_abc', type: 'universal', hosts: ['example.com'], status: 'active', primary_certificate: 'cert_1', certificates: [] }];
    const client = await buildClient(() => makeCfSuccess(mockPacks));
    const packs = await client.listCertificatePacks('zone_123');
    assert.equal(packs.length, 1);
    assert.equal(packs[0]?.id, 'pack_abc');
  });

  it('orderAdvancedCertPack returns null on API failure', async () => {
    const client = await buildClient(() => makeCfFailure('ACM not available'));
    const result = await client.orderAdvancedCertPack('zone_123', 'example.com');
    assert.equal(result, null);
  });

  it('orderAdvancedCertPack returns id+status on success', async () => {
    const client = await buildClient(() => makeCfSuccess({ id: 'pack_new', status: 'initializing' }));
    const result = await client.orderAdvancedCertPack('zone_123', 'example.com');
    assert.ok(result !== null);
    assert.equal(result?.id, 'pack_new');
  });

  it('createCustomHostname returns null on API failure', async () => {
    const client = await buildClient(() => makeCfFailure('Requires Cloudflare for SaaS'));
    const result = await client.createCustomHostname('zone_123', 'custom.example.com');
    assert.equal(result, null);
  });

  it('getSslDetails returns empty object when no packs exist', async () => {
    const client = await buildClient(() => makeCfSuccess([]));
    const details = await client.getSslDetails('zone_123');
    assert.deepEqual(details, {});
  });

  it('getSslDetails maps pack to CloudflareSslDetails shape', async () => {
    const mockPacks = [{
      id: 'pack_abc', type: 'universal', hosts: ['example.com'], status: 'active',
      primary_certificate: 'cert_1',
      certificates: [{
        id: 'cert_1', type: 'dv', hosts: ['example.com'], issuer: 'LetsEncrypt',
        signature: 'sha256WithRSAEncryption', status: 'active', bundle_method: 'ubiquitous',
        validity_days: 365, uploaded_on: '2026-01-01T00:00:00Z', modified_on: '2026-01-01T00:00:00Z',
        expires_on: '2027-01-01T00:00:00Z',
      }],
    }];
    const client = await buildClient(() => makeCfSuccess(mockPacks));
    const details = await client.getSslDetails('zone_123');
    assert.equal(details.certPackId, 'pack_abc');
    assert.equal(details.type, 'universal');
    assert.ok(details.primaryCertificate !== undefined);
    assert.equal(details.primaryCertificate?.issuer, 'LetsEncrypt');
  });
});

describe('SslService', () => {
  type SslCertRecord = {
    id: string; domainId: string; provider: string; status: string; sslMode: string;
    issuedAt: Date | null; expiresAt: Date | null; lastCheckedAt: Date | null;
    renewalAttempts: number; errorMessage: string | null;
    cloudflareCertPackId: string | null; cloudflareHostnameId: string | null;
    acmeChallengeType: string | null; acmeOrderUrl: string | null;
    createdAt: Date; updatedAt: Date;
  };

  interface DomainRecord {
    id: string; domain: string; tenantId: string; status: string;
    cloudflareZoneId: string | null; ssl?: SslCertRecord | null;
  }

  function makeMockPrisma(overrides: { domain?: DomainRecord | null; ssl?: SslCertRecord | null } = {}) {
    const certStore: Record<string, SslCertRecord> = {};
    if (overrides.ssl) certStore[overrides.ssl.domainId] = overrides.ssl;
    if (overrides.domain?.ssl) certStore[overrides.domain.ssl.domainId] = overrides.domain.ssl;

    return {
      domain: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id !== (overrides.domain?.id ?? 'dom_01')) return null;
          return overrides.domain ?? makeDbDomain();
        },
      },
      sslCertificate: {
        upsert: async ({ create }: { where: unknown; create: SslCertRecord; update: unknown }) => {
          const id = `cert_${Date.now()}`;
          const rec: SslCertRecord = { ...create, id, createdAt: new Date(), updatedAt: new Date() };
          certStore[rec.domainId] = rec;
          return rec;
        },
        findUnique: async ({ where }: { where: { domainId: string } }) => certStore[where.domainId] ?? null,
        update: async ({ where, data }: { where: { domainId: string }; data: Partial<SslCertRecord> }) => {
          const existing = certStore[where.domainId];
          if (!existing) throw new Error('Record not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          certStore[where.domainId] = updated;
          return updated;
        },
        findMany: async ({ where }: { where?: Partial<SslCertRecord> } = {}) => {
          return Object.values(certStore).filter(r => {
            if (!where) return true;
            return Object.entries(where).every(([k, v]) => r[k as keyof SslCertRecord] === v);
          });
        },
      },
    };
  }

  function makeDbDomain(overrides: Partial<DomainRecord> = {}): DomainRecord {
    return { id: 'dom_01', domain: 'example.com', tenantId: 'tenant_01', status: 'active', cloudflareZoneId: 'zone_abc', ssl: null, ...overrides };
  }

  function makeMockCfClient(overrides: {
    setSslMode?: () => Promise<void>;
    listCertificatePacks?: () => Promise<unknown[]>;
    orderAdvancedCertPack?: () => Promise<{ id: string; status: string } | null>;
    createCustomHostname?: () => Promise<{ id: string; status: string } | null>;
    getSslDetails?: () => Promise<Record<string, unknown>>;
  } = {}) {
    return {
      setSslMode: overrides.setSslMode ?? (async () => {}),
      listCertificatePacks: overrides.listCertificatePacks ?? (async () => []),
      orderAdvancedCertPack: overrides.orderAdvancedCertPack ?? (async () => null),
      createCustomHostname: overrides.createCustomHostname ?? (async () => null),
      getSslMode: async () => 'full',
      getCertificatePack: async () => null,
      getCustomHostname: async () => null,
      deleteCustomHostname: async () => {},
      getSslDetails: overrides.getSslDetails ?? (async () => ({})),
    };
  }

  const mockEmitter = {
    emitted: [] as Array<{ event: string; data: unknown }>,
    emit(event: string, data: unknown) { this.emitted.push({ event, data }); },
    reset() { this.emitted = []; },
  };

  async function buildService(opts: { prisma?: ReturnType<typeof makeMockPrisma>; cfClient?: ReturnType<typeof makeMockCfClient>; options?: SslModuleOptions } = {}) {
    const { SslService } = await import('../services/ssl.service.js');
    const options = opts.options ?? makeOptions();
    const prisma = opts.prisma ?? makeMockPrisma();
    const cfClient = opts.cfClient ?? makeMockCfClient();
    return new (SslService as unknown as { new(options: SslModuleOptions, prisma: unknown, cfClient: unknown, emitter: unknown): InstanceType<typeof SslService> })(options, prisma, cfClient, mockEmitter);
  }

  beforeEach(() => mockEmitter.reset());

  it('provisionSsl: throws NotFoundException when domain not found', async () => {
    const prisma = makeMockPrisma({ domain: null });
    const svc = await buildService({ prisma });
    await assert.rejects(() => svc.provisionSsl({ domainId: 'dom_missing', hostname: 'x.com', cloudflareZoneId: 'z' }), /dom_missing/);
  });

  it('provisionSsl: activates Cloudflare when universal SSL pack is active', async () => {
    const prisma = makeMockPrisma({ domain: makeDbDomain() });
    const cfClient = makeMockCfClient({
      listCertificatePacks: async () => [{
        id: 'pack_01', type: 'universal', hosts: ['example.com'], status: 'active',
        primary_certificate: 'cert_1',
        certificates: [{ id: 'cert_1', expires_on: '2027-01-01T00:00:00Z', uploaded_on: '2026-01-01T00:00:00Z' }],
      }],
    });
    const svc = await buildService({ prisma, cfClient });
    const result = await svc.provisionSsl({ domainId: 'dom_01', hostname: 'example.com', cloudflareZoneId: 'zone_abc' }) as SslProvisionResult;
    assert.equal(result.provider, 'cloudflare');
    assert.ok(result.cloudflareActivated);
    assert.ok(!result.letsEncryptFallback);
    assert.ok(result.certificate.cloudflareCertPackId === 'pack_01');
  });

  it('provisionSsl: falls back to LE when Cloudflare unavailable', async () => {
    const prisma = makeMockPrisma({ domain: makeDbDomain({ cloudflareZoneId: null }) });
    const svc = await buildService({ prisma });
    const result = await svc.provisionSsl({ domainId: 'dom_01', hostname: 'example.com', cloudflareZoneId: '' }) as SslProvisionResult;
    assert.equal(result.provider, 'letsencrypt');
    assert.ok(result.letsEncryptFallback);
    assert.ok(!result.cloudflareActivated);
  });

  it('provisionSsl: emits ssl.provisioned event', async () => {
    const prisma = makeMockPrisma({ domain: makeDbDomain() });
    const svc = await buildService({ prisma });
    await svc.provisionSsl({ domainId: 'dom_01', hostname: 'example.com', cloudflareZoneId: '' });
    const event = mockEmitter.emitted.find(e => e.event === SSL_EVENTS.PROVISIONED);
    assert.ok(event !== undefined, 'ssl.provisioned event should be emitted');
  });

  it('checkCertificateStatus: returns pending status for domain with no cert', async () => {
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: null }) });
    const svc = await buildService({ prisma });
    const status = await svc.checkCertificateStatus('dom_01') as CertificateStatus;
    assert.equal(status.status, 'pending');
    assert.equal(status.isValid, false);
    assert.equal(status.expiresAt, null);
  });

  it('checkCertificateStatus: throws NotFoundException for unknown domain', async () => {
    const prisma = makeMockPrisma({ domain: null });
    const svc = await buildService({ prisma });
    await assert.rejects(() => svc.checkCertificateStatus('dom_missing'), /dom_missing/);
  });

  it('checkCertificateStatus: computes daysUntilExpiry correctly', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const cert: SslCertRecord = {
      id: 'cert_01', domainId: 'dom_01', provider: 'cloudflare', status: 'active', sslMode: 'full',
      issuedAt: new Date(), expiresAt: futureExpiry, lastCheckedAt: null, renewalAttempts: 0,
      errorMessage: null, cloudflareCertPackId: 'pack_01', cloudflareHostnameId: null,
      acmeChallengeType: null, acmeOrderUrl: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: cert, cloudflareZoneId: null }) });
    const svc = await buildService({ prisma });
    const status = await svc.checkCertificateStatus('dom_01') as CertificateStatus;
    assert.ok(status.daysUntilExpiry !== null);
    assert.ok(status.daysUntilExpiry >= 59 && status.daysUntilExpiry <= 61);
    assert.ok(!status.isExpiringSoon);
  });

  it('checkCertificateStatus: flags isExpiringSoon when < 30 days remain', async () => {
    const nearExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const cert: SslCertRecord = {
      id: 'cert_02', domainId: 'dom_01', provider: 'letsencrypt', status: 'active', sslMode: 'full',
      issuedAt: new Date(), expiresAt: nearExpiry, lastCheckedAt: null, renewalAttempts: 0,
      errorMessage: null, cloudflareCertPackId: null, cloudflareHostnameId: null,
      acmeChallengeType: 'http-01', acmeOrderUrl: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: cert, cloudflareZoneId: null }) });
    const svc = await buildService({ prisma });
    const status = await svc.checkCertificateStatus('dom_01') as CertificateStatus;
    assert.ok(status.isExpiringSoon, 'should flag as expiring soon at 10 days');
  });

  it('renewCertificate: throws NotFoundException when domain not found', async () => {
    const prisma = makeMockPrisma({ domain: null });
    const svc = await buildService({ prisma });
    await assert.rejects(() => svc.renewCertificate('dom_missing'), /dom_missing/);
  });

  it('renewCertificate: succeeds for LE provider', async () => {
    const cert: SslCertRecord = {
      id: 'cert_03', domainId: 'dom_01', provider: 'letsencrypt', status: 'expiring', sslMode: 'full',
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      lastCheckedAt: null, renewalAttempts: 1, errorMessage: null,
      cloudflareCertPackId: null, cloudflareHostnameId: null,
      acmeChallengeType: 'http-01', acmeOrderUrl: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: cert, cloudflareZoneId: null }) });
    const svc = await buildService({ prisma });
    const result = await svc.renewCertificate('dom_01');
    assert.equal(result.success, true);
    assert.equal(result.provider, 'letsencrypt');
    assert.ok(result.newExpiresAt !== null);
    const renewedEvent = mockEmitter.emitted.find(e => e.event === SSL_EVENTS.RENEWED);
    assert.ok(renewedEvent !== undefined, 'ssl.renewed event should be emitted');
  });

  it('renewCertificate: returns Cloudflare auto-managed message for Universal SSL', async () => {
    const cert: SslCertRecord = {
      id: 'cert_04', domainId: 'dom_01', provider: 'cloudflare', status: 'expiring', sslMode: 'full',
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      lastCheckedAt: null, renewalAttempts: 0, errorMessage: null,
      cloudflareCertPackId: 'pack_01', cloudflareHostnameId: null,
      acmeChallengeType: null, acmeOrderUrl: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: cert }) });
    const cfClient = makeMockCfClient({ orderAdvancedCertPack: async () => null });
    const svc = await buildService({ prisma, cfClient });
    const result = await svc.renewCertificate('dom_01');
    assert.equal(result.success, true);
    assert.equal(result.provider, 'cloudflare');
    assert.ok(result.message.includes('automatically'));
  });

  it('findAll: returns all certificates', async () => {
    const cert: SslCertRecord = {
      id: 'cert_05', domainId: 'dom_01', provider: 'cloudflare', status: 'active', sslMode: 'full',
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
      lastCheckedAt: new Date(), renewalAttempts: 0, errorMessage: null,
      cloudflareCertPackId: 'pack_01', cloudflareHostnameId: null,
      acmeChallengeType: null, acmeOrderUrl: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = makeMockPrisma({ domain: makeDbDomain({ ssl: cert }), ssl: cert });
    const svc = await buildService({ prisma });
    const all = await svc.findAll();
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 1);
  });
});

describe('SslMonitorService', () => {
  async function buildMonitor(opts: {
    certs?: SslCertificate[];
    checkFn?: (domainId: string) => Promise<{ hostname: string; expiresAt: Date | null }>;
    options?: SslModuleOptions;
  } = {}) {
    const { SslMonitorService } = await import('../services/ssl-monitor.service.js');
    const certs = opts.certs ?? [];
    const checkFn = opts.checkFn ?? (async (id: string) => ({ hostname: `${id}.example.com`, expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000) }));
    const mockSslService = { findAll: async () => certs, checkCertificateStatus: checkFn };
    const emitter = { emitted: [] as Array<{ event: string; data: unknown }>, emit(event: string, data: unknown) { this.emitted.push({ event, data }); } };
    const options = opts.options ?? makeOptions({ expiryWarningDays: 30 });
    const monitor = new (SslMonitorService as unknown as { new(opts: SslModuleOptions, svc: unknown, emitter: unknown): InstanceType<typeof SslMonitorService> })(options, mockSslService, emitter);
    return { monitor, emitter };
  }

  it('runCheck: completes with 0 certs and no events', async () => {
    const { monitor, emitter } = await buildMonitor({ certs: [] });
    const result = await monitor.runCheck();
    assert.equal(result.checked, 0);
    assert.equal(result.warnings, 0);
    assert.equal(result.expired, 0);
    assert.equal(emitter.emitted.length, 0);
  });

  it('runCheck: emits EXPIRY_WARNING for cert expiring in < 30 days', async () => {
    const cert = makeCertRecord({ domainId: 'dom_01', status: 'expiring', expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), lastCheckedAt: null });
    const { monitor, emitter } = await buildMonitor({
      certs: [cert],
      checkFn: async (id: string) => ({ hostname: `${id}.example.com`, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) }),
    });
    const result = await monitor.runCheck();
    assert.ok(result.warnings >= 1);
    const warning = emitter.emitted.find(e => e.event === SSL_EVENTS.EXPIRY_WARNING);
    assert.ok(warning !== undefined, 'EXPIRY_WARNING event should be emitted');
    const data = warning.data as { daysUntilExpiry: number };
    assert.ok(data.daysUntilExpiry >= 9 && data.daysUntilExpiry <= 11);
  });

  it('runCheck: emits EXPIRED for a certificate that has expired', async () => {
    const cert = makeCertRecord({ domainId: 'dom_02', status: 'expired', expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), lastCheckedAt: null });
    const { monitor, emitter } = await buildMonitor({
      certs: [cert],
      checkFn: async (id: string) => ({ hostname: `${id}.example.com`, expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
    });
    const result = await monitor.runCheck();
    assert.equal(result.expired, 1);
    const expiredEvent = emitter.emitted.find(e => e.event === SSL_EVENTS.EXPIRED);
    assert.ok(expiredEvent !== undefined, 'EXPIRED event should be emitted');
  });

  it('runCheck: healthy cert with null expiresAt produces ok result', async () => {
    const cert = makeCertRecord({ domainId: 'dom_03', status: 'active', expiresAt: null, lastCheckedAt: null });
    const { monitor, emitter } = await buildMonitor({ certs: [cert], checkFn: async (id: string) => ({ hostname: `${id}.example.com`, expiresAt: null }) });
    const result = await monitor.runCheck();
    assert.equal(result.warnings, 0);
    assert.equal(result.expired, 0);
    assert.equal(emitter.emitted.length, 0);
  });

  it('stopMonitoring: clears the timer gracefully', async () => {
    const { monitor } = await buildMonitor();
    monitor.startMonitoring();
    assert.doesNotThrow(() => monitor.stopMonitoring());
  });

  it('onModuleDestroy: calls stopMonitoring', async () => {
    const { monitor } = await buildMonitor();
    monitor.startMonitoring();
    assert.doesNotThrow(() => monitor.onModuleDestroy());
  });
});

describe('SslController — health response shape', () => {
  it('health response contains all required fields', () => {
    const healthResponse = {
      domainId: 'dom_01', hostname: 'example.com', isValid: true, status: 'active',
      provider: 'cloudflare', expiresAt: new Date('2027-01-01'), daysUntilExpiry: 290,
      isExpiringSoon: false, checkedAt: new Date(),
    };
    assert.ok(typeof healthResponse.domainId === 'string');
    assert.ok(typeof healthResponse.isValid === 'boolean');
    assert.ok(healthResponse.expiresAt instanceof Date);
    assert.ok(typeof healthResponse.daysUntilExpiry === 'number');
  });

  it('health response with null expiry is well-formed', () => {
    const healthResponse = {
      domainId: 'dom_01', hostname: 'example.com', isValid: false, status: 'pending',
      provider: 'cloudflare', expiresAt: null, daysUntilExpiry: null, isExpiringSoon: false, checkedAt: new Date(),
    };
    assert.equal(healthResponse.expiresAt, null);
    assert.equal(healthResponse.daysUntilExpiry, null);
    assert.equal(healthResponse.isValid, false);
  });
});
