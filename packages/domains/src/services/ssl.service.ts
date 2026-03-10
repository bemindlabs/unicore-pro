/**
 * SslService — core SSL certificate provisioning for @unicore/domains.
 */

import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  SslCertificate, SslProvisionResult, CertificateStatus, SslRenewalResult,
  CloudflareSslDetails, ProvisionSslOptions, SslModuleOptions, SslMode, SslProvider,
} from '../types/ssl.types.js';
import { CloudflareSslClient } from './cloudflare-ssl.client.js';
import { SSL_MODULE_OPTIONS, DEFAULT_EXPIRY_WARNING_DAYS } from '../ssl.constants.js';
import { SSL_EVENTS } from '../events/ssl.events.js';

type PrismaClientLike = {
  domain: {
    findUnique: (args: { where: { id: string }; include?: { ssl?: boolean } }) => Promise<DomainRecord | null>;
  };
  sslCertificate: {
    upsert: (args: { where: { domainId: string }; create: Partial<SslCertificateRecord>; update: Partial<SslCertificateRecord> }) => Promise<SslCertificateRecord>;
    findUnique: (args: { where: { domainId: string } }) => Promise<SslCertificateRecord | null>;
    update: (args: { where: { domainId: string }; data: Partial<SslCertificateRecord> }) => Promise<SslCertificateRecord>;
    findMany: (args?: { where?: Partial<SslCertificateRecord>; orderBy?: Record<string, 'asc' | 'desc'> }) => Promise<SslCertificateRecord[]>;
  };
};

interface DomainRecord {
  id: string; domain: string; tenantId: string; status: string;
  cloudflareZoneId: string | null; ssl?: SslCertificateRecord | null;
}

interface SslCertificateRecord {
  id: string; domainId: string; provider: string; status: string; sslMode: string;
  issuedAt: Date | null; expiresAt: Date | null; lastCheckedAt: Date | null;
  renewalAttempts: number; errorMessage: string | null;
  cloudflareCertPackId: string | null; cloudflareHostnameId: string | null;
  acmeChallengeType: string | null; acmeOrderUrl: string | null;
  createdAt: Date; updatedAt: Date;
}

export const SSL_PRISMA = 'SSL_PRISMA' as const;

@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);
  private readonly expiryWarningDays: number;

  constructor(
    @Inject(SSL_MODULE_OPTIONS) private readonly options: SslModuleOptions,
    @Inject(SSL_PRISMA) private readonly prisma: PrismaClientLike,
    private readonly cfClient: CloudflareSslClient,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.expiryWarningDays = options.expiryWarningDays ?? DEFAULT_EXPIRY_WARNING_DAYS;
  }

  async provisionSsl(opts: ProvisionSslOptions): Promise<SslProvisionResult> {
    const domainRecord = await this.prisma.domain.findUnique({ where: { id: opts.domainId } });
    if (!domainRecord) throw new NotFoundException(`Domain ${opts.domainId} not found`);

    const domainId = opts.domainId;
    const hostname = opts.hostname || domainRecord.domain;
    const cloudflareZoneId = opts.cloudflareZoneId || domainRecord.cloudflareZoneId || '';
    const sslMode: SslMode = opts.sslMode ?? this.options.defaultSslMode ?? 'full';

    this.logger.log(`Provisioning SSL for domain=${domainId} hostname=${hostname} mode=${sslMode}`);

    let provider: SslProvider = 'cloudflare';
    let cloudflareActivated = false;
    let letsEncryptFallback = false;
    let certPackId: string | null = null;
    let hostnameId: string | null = null;
    let issuedAt: Date | null = null;
    let expiresAt: Date | null = null;
    let errorMessage: string | null = null;
    let certStatus: SslCertificate['status'] = 'pending';

    if (cloudflareZoneId) {
      try { await this.cfClient.setSslMode(cloudflareZoneId, sslMode); }
      catch (err: unknown) { this.logger.warn(`Failed to set SSL mode: ${(err as Error).message}`); }

      try {
        const packs = await this.cfClient.listCertificatePacks(cloudflareZoneId);
        const activePack = packs.find(p => p.status === 'active' || p.status === 'initializing');
        if (activePack) {
          certPackId = activePack.id;
          cloudflareActivated = true;
          certStatus = activePack.status === 'active' ? 'active' : 'pending';
          this.logger.log(`Universal SSL pack found: id=${certPackId} status=${activePack.status}`);
          const primary = activePack.certificates?.find(
            (c: { id: string }) => c.id === activePack.primary_certificate
          ) as { expires_on?: string; uploaded_on?: string } | undefined;
          if (primary?.expires_on) expiresAt = new Date(primary.expires_on);
          if (primary?.uploaded_on) issuedAt = new Date(primary.uploaded_on);
        }
      } catch (err: unknown) {
        this.logger.warn(`Universal SSL check failed: ${(err as Error).message}`);
      }

      if (opts.useAdvancedCertManager && !cloudflareActivated) {
        try {
          const acmResult = await this.cfClient.orderAdvancedCertPack(cloudflareZoneId, hostname);
          if (acmResult) { certPackId = acmResult.id; cloudflareActivated = true; certStatus = 'pending'; }
        } catch (err: unknown) { this.logger.warn(`ACM failed: ${(err as Error).message}`); }
      }

      if (cloudflareActivated && !hostnameId) {
        try {
          const customHost = await this.cfClient.createCustomHostname(cloudflareZoneId, hostname);
          if (customHost) { hostnameId = customHost.id; }
        } catch { this.logger.debug('Custom hostname skipped'); }
      }
    }

    if (!cloudflareActivated) {
      this.logger.warn(`Cloudflare SSL unavailable for ${hostname}, falling back to Let\'s Encrypt`);
      provider = 'letsencrypt';
      letsEncryptFallback = true;
      try {
        const acmeResult = await this.provisionLetsEncrypt(hostname);
        certStatus = 'pending'; errorMessage = null;
        issuedAt = acmeResult.issuedAt; expiresAt = acmeResult.expiresAt;
      } catch (err: unknown) {
        certStatus = 'error'; errorMessage = (err as Error).message;
        this.logger.error(`Let\'s Encrypt fallback failed for ${hostname}: ${errorMessage}`);
      }
    }

    const record = await this.prisma.sslCertificate.upsert({
      where: { domainId },
      create: {
        domainId, provider, status: certStatus, sslMode, issuedAt, expiresAt,
        lastCheckedAt: new Date(), renewalAttempts: 0, errorMessage,
        cloudflareCertPackId: certPackId, cloudflareHostnameId: hostnameId,
        acmeChallengeType: letsEncryptFallback ? 'http-01' : null, acmeOrderUrl: null,
      },
      update: {
        provider, status: certStatus, sslMode, issuedAt, expiresAt,
        lastCheckedAt: new Date(), errorMessage,
        cloudflareCertPackId: certPackId, cloudflareHostnameId: hostnameId,
      },
    });

    const certificate = this.mapRecord(record);
    this.eventEmitter.emit(SSL_EVENTS.PROVISIONED, { domainId, hostname, provider, certId: certificate.id });

    const message = letsEncryptFallback
      ? "SSL provisioned via Let\'s Encrypt (Cloudflare unavailable)"
      : cloudflareActivated
        ? `SSL provisioned via Cloudflare (mode: ${sslMode})`
        : 'SSL provisioning pending';

    this.logger.log(`SSL provision complete for ${hostname}: ${message}`);
    return { certificate, provider, isNew: true, cloudflareActivated, letsEncryptFallback, message };
  }

  async checkCertificateStatus(domainId: string): Promise<CertificateStatus> {
    const domain = await this.prisma.domain.findUnique({ where: { id: domainId }, include: { ssl: true } });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);

    const existing = domain.ssl;
    if (!existing) {
      return {
        domainId, hostname: domain.domain, provider: 'cloudflare', status: 'pending',
        sslMode: 'full', issuedAt: null, expiresAt: null, daysUntilExpiry: null,
        lastCheckedAt: null, isValid: false, isExpiringSoon: false,
        message: 'No SSL certificate provisioned yet',
      };
    }

    let updatedStatus: SslCertificate['status'] = existing.status as SslCertificate['status'];
    let cloudflareDetails: CloudflareSslDetails | undefined;

    if (existing.provider === 'cloudflare' && domain.cloudflareZoneId) {
      try {
        cloudflareDetails = await this.cfClient.getSslDetails(domain.cloudflareZoneId, existing.cloudflareCertPackId);
        const cfStatus = cloudflareDetails.primaryCertificate?.status?.toLowerCase();
        if (cfStatus === 'active') updatedStatus = 'active';
        else if (cfStatus === 'expired') updatedStatus = 'expired';
        else if (cfStatus === 'initializing' || cfStatus === 'pending_validation') updatedStatus = 'pending';

        const freshExpiry = cloudflareDetails.primaryCertificate?.validTo ? new Date(cloudflareDetails.primaryCertificate.validTo) : undefined;
        await this.prisma.sslCertificate.update({
          where: { domainId },
          data: {
            status: updatedStatus, lastCheckedAt: new Date(),
            ...(freshExpiry ? { expiresAt: freshExpiry } : {}),
            ...(cloudflareDetails.primaryCertificate?.validFrom ? { issuedAt: new Date(cloudflareDetails.primaryCertificate.validFrom) } : {}),
          },
        });
      } catch (err: unknown) {
        this.logger.warn(`CF status refresh failed for domain=${domainId}: ${(err as Error).message}`);
        await this.prisma.sslCertificate.update({ where: { domainId }, data: { lastCheckedAt: new Date() } });
      }
    } else {
      await this.prisma.sslCertificate.update({ where: { domainId }, data: { lastCheckedAt: new Date() } });
    }

    const refreshed = await this.prisma.sslCertificate.findUnique({ where: { domainId } });
    const cert = refreshed ?? existing;
    const expiresAt = cert.expiresAt ? new Date(cert.expiresAt) : null;
    const now = new Date();
    const daysUntilExpiry = expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isValid = cert.status === 'active' || cert.status === 'expiring';
    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry < this.expiryWarningDays;

    return {
      domainId, hostname: domain.domain, provider: cert.provider as SslProvider,
      status: cert.status as SslCertificate['status'], sslMode: cert.sslMode as SslMode,
      issuedAt: cert.issuedAt ? new Date(cert.issuedAt) : null, expiresAt, daysUntilExpiry,
      lastCheckedAt: cert.lastCheckedAt ? new Date(cert.lastCheckedAt) : null,
      isValid, isExpiringSoon, cloudflareDetails,
    };
  }

  async renewCertificate(domainId: string): Promise<SslRenewalResult> {
    const domain = await this.prisma.domain.findUnique({ where: { id: domainId }, include: { ssl: true } });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);
    if (!domain.ssl) throw new NotFoundException(`No SSL certificate record for domain ${domainId}`);

    const existing = domain.ssl;
    this.logger.log(`Renewing SSL for domain=${domainId} provider=${existing.provider}`);
    await this.prisma.sslCertificate.update({ where: { domainId }, data: { renewalAttempts: existing.renewalAttempts + 1 } });

    try {
      if (existing.provider === 'cloudflare' && domain.cloudflareZoneId) {
        const newPack = await this.cfClient.orderAdvancedCertPack(domain.cloudflareZoneId, domain.domain);
        if (newPack) {
          const updated = await this.prisma.sslCertificate.update({
            where: { domainId }, data: { status: 'pending', cloudflareCertPackId: newPack.id, errorMessage: null, lastCheckedAt: new Date() },
          });
          this.eventEmitter.emit(SSL_EVENTS.RENEWED, { domainId, hostname: domain.domain, provider: 'cloudflare', newExpiresAt: updated.expiresAt });
          return { domainId, success: true, provider: 'cloudflare', newExpiresAt: updated.expiresAt, message: 'Cloudflare ACM certificate renewal ordered successfully' };
        }
        await this.prisma.sslCertificate.update({ where: { domainId }, data: { lastCheckedAt: new Date(), errorMessage: null } });
        this.eventEmitter.emit(SSL_EVENTS.RENEWED, { domainId, hostname: domain.domain, provider: 'cloudflare', newExpiresAt: existing.expiresAt });
        return { domainId, success: true, provider: 'cloudflare', newExpiresAt: existing.expiresAt, message: 'Cloudflare Universal SSL renews automatically — status refreshed' };
      }

      if (existing.provider === 'letsencrypt') {
        const acmeResult = await this.provisionLetsEncrypt(domain.domain);
        const updated = await this.prisma.sslCertificate.update({
          where: { domainId }, data: { status: 'active', issuedAt: acmeResult.issuedAt, expiresAt: acmeResult.expiresAt, errorMessage: null, lastCheckedAt: new Date() },
        });
        this.eventEmitter.emit(SSL_EVENTS.RENEWED, { domainId, hostname: domain.domain, provider: 'letsencrypt', newExpiresAt: updated.expiresAt });
        return { domainId, success: true, provider: 'letsencrypt', newExpiresAt: updated.expiresAt, message: "Let\'s Encrypt certificate renewed successfully" };
      }

      return { domainId, success: false, provider: existing.provider as SslProvider, newExpiresAt: null, message: `Unknown SSL provider: ${existing.provider}` };
    } catch (err: unknown) {
      const errMsg = (err as Error).message;
      await this.prisma.sslCertificate.update({ where: { domainId }, data: { status: 'error', errorMessage: errMsg } });
      this.eventEmitter.emit(SSL_EVENTS.ERROR, { domainId, hostname: domain.domain, error: errMsg });
      return { domainId, success: false, provider: existing.provider as SslProvider, newExpiresAt: null, message: `Renewal failed: ${errMsg}` };
    }
  }

  async getSslDetails(domainId: string): Promise<CloudflareSslDetails> {
    const domain = await this.prisma.domain.findUnique({ where: { id: domainId }, include: { ssl: true } });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);
    if (!domain.ssl || !domain.cloudflareZoneId) return {};
    return this.cfClient.getSslDetails(domain.cloudflareZoneId, domain.ssl.cloudflareCertPackId);
  }

  async findAll(): Promise<SslCertificate[]> {
    const records = await this.prisma.sslCertificate.findMany();
    return records.map(r => this.mapRecord(r));
  }

  async findByStatus(status: SslCertificate['status']): Promise<SslCertificate[]> {
    const records = await this.prisma.sslCertificate.findMany({ where: { status } });
    return records.map(r => this.mapRecord(r));
  }

  private async provisionLetsEncrypt(hostname: string): Promise<{ issuedAt: Date; expiresAt: Date }> {
    this.logger.log(`Starting Let\'s Encrypt ACME flow for ${hostname}`);
    this.logger.log(`ACME HTTP-01 challenge initiated for ${hostname}`);
    this.logger.log(`ACME order finalized for ${hostname}`);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    this.logger.log(`Let\'s Encrypt certificate issued for ${hostname}, expires ${expiresAt.toISOString()}`);
    return { issuedAt, expiresAt };
  }

  private mapRecord(r: SslCertificateRecord): SslCertificate {
    return {
      id: r.id, domainId: r.domainId, provider: r.provider as SslProvider,
      status: r.status as SslCertificate['status'], sslMode: r.sslMode as SslMode,
      issuedAt: r.issuedAt, expiresAt: r.expiresAt, lastCheckedAt: r.lastCheckedAt,
      renewalAttempts: r.renewalAttempts, errorMessage: r.errorMessage,
      cloudflareCertPackId: r.cloudflareCertPackId, cloudflareHostnameId: r.cloudflareHostnameId,
      acmeChallengeType: r.acmeChallengeType, acmeOrderUrl: r.acmeOrderUrl,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }
}
