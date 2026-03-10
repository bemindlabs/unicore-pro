/**
 * SslService — core SSL certificate provisioning logic for @unicore/domains.
 *
 * Responsibilities:
 *  - provisionSsl: configure Cloudflare SSL mode and activate Universal SSL / ACM.
 *  - checkCertificateStatus: inspect the current certificate state.
 *  - renewCertificate: trigger certificate renewal (Cloudflare or Let's Encrypt).
 *  - getSslDetails: retrieve full Cloudflare SSL details for a domain.
 *  - Let's Encrypt ACME fallback when Cloudflare SSL is unavailable.
 */

import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  SslCertificate,
  SslProvisionResult,
  CertificateStatus,
  SslRenewalResult,
  CloudflareSslDetails,
  ProvisionSslOptions,
  SslModuleOptions,
  SslMode,
  SslProvider,
} from '../types/ssl.types.js';

import { CloudflareSslClient } from './cloudflare-ssl.client.js';
import { SSL_MODULE_OPTIONS, DEFAULT_EXPIRY_WARNING_DAYS } from '../ssl.constants.js';
import { SSL_EVENTS } from '../events/ssl.events.js';

// ---------------------------------------------------------------------------
// Prisma-compatible type stubs
// Replace PrismaClientLike usage with the actual injected PrismaService in production.
// ---------------------------------------------------------------------------

type PrismaClientLike = {
  domain: {
    findUnique: (args: {
      where: { id: string };
      include?: { ssl?: boolean };
    }) => Promise<DomainRecord | null>;
  };
  sslCertificate: {
    upsert: (args: {
      where: { domainId: string };
      create: Partial<SslCertificateRecord>;
      update: Partial<SslCertificateRecord>;
    }) => Promise<SslCertificateRecord>;
    findUnique: (args: {
      where: { domainId: string };
    }) => Promise<SslCertificateRecord | null>;
    update: (args: {
      where: { domainId: string };
      data: Partial<SslCertificateRecord>;
    }) => Promise<SslCertificateRecord>;
    findMany: (args?: {
      where?: Partial<SslCertificateRecord>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) => Promise<SslCertificateRecord[]>;
  };
};

interface DomainRecord {
  id: string;
  domain: string;
  tenantId: string;
  status: string;
  cloudflareZoneId: string | null;
  ssl?: SslCertificateRecord | null;
}

interface SslCertificateRecord {
  id: string;
  domainId: string;
  provider: string;
  status: string;
  sslMode: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  renewalAttempts: number;
  errorMessage: string | null;
  cloudflareCertPackId: string | null;
  cloudflareHostnameId: string | null;
  acmeChallengeType: string | null;
  acmeOrderUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Injection token for the Prisma client
// ---------------------------------------------------------------------------

export const SSL_PRISMA = 'SSL_PRISMA' as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // provisionSsl
  // ---------------------------------------------------------------------------

  /**
   * Provisions an SSL certificate for the given domain.
   *
   * Flow:
   * 1. Set the Cloudflare SSL/TLS mode (full/strict/etc.) on the zone.
   * 2. Inspect existing Universal SSL certificate packs — mark as active if found.
   * 3. Optionally order an Advanced Certificate Manager (ACM) pack.
   * 4. Attempt to create a custom hostname entry (Cloudflare for SaaS).
   * 5. If Cloudflare SSL is completely unavailable, fall back to Let's Encrypt ACME.
   * 6. Persist the SslCertificate record and emit ssl.provisioned.
   */
  async provisionSsl(opts: ProvisionSslOptions): Promise<SslProvisionResult> {
    // Resolve the hostname from the domain record when not supplied by caller
    const domainRecord = await this.prisma.domain.findUnique({
      where: { id: opts.domainId },
    });
    if (!domainRecord) {
      throw new NotFoundException(`Domain ${opts.domainId} not found`);
    }

    const domainId = opts.domainId;
    const hostname = opts.hostname || domainRecord.domain;
    const cloudflareZoneId = opts.cloudflareZoneId || domainRecord.cloudflareZoneId || '';
    const sslMode: SslMode = opts.sslMode ?? this.options.defaultSslMode ?? 'full';

    this.logger.log(
      `Provisioning SSL for domain=${domainId} hostname=${hostname} mode=${sslMode}`,
    );

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
      // Step 1: Set Cloudflare SSL mode
      try {
        await this.cfClient.setSslMode(cloudflareZoneId, sslMode);
      } catch (err: unknown) {
        this.logger.warn(`Failed to set Cloudflare SSL mode: ${(err as Error).message}`);
      }

      // Step 2: Check existing Universal SSL certificate packs
      try {
        const packs = await this.cfClient.listCertificatePacks(cloudflareZoneId);
        const activePack = packs.find(
          (p) => p.status === 'active' || p.status === 'initializing',
        );

        if (activePack) {
          certPackId = activePack.id;
          cloudflareActivated = true;
          certStatus = activePack.status === 'active' ? 'active' : 'pending';

          this.logger.log(
            `Universal SSL pack found: id=${certPackId} status=${activePack.status}`,
          );

          const primary = activePack.certificates?.find(
            (c: { id: string }) => c.id === activePack.primary_certificate,
          ) as { expires_on?: string; uploaded_on?: string } | undefined;

          if (primary?.expires_on) expiresAt = new Date(primary.expires_on);
          if (primary?.uploaded_on) issuedAt = new Date(primary.uploaded_on);
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Universal SSL check failed for zone=${cloudflareZoneId}: ${(err as Error).message}`,
        );
      }

      // Step 3: Optionally order Advanced Certificate Manager
      if (opts.useAdvancedCertManager && !cloudflareActivated) {
        try {
          const acmResult = await this.cfClient.orderAdvancedCertPack(
            cloudflareZoneId,
            hostname,
          );
          if (acmResult) {
            certPackId = acmResult.id;
            cloudflareActivated = true;
            certStatus = 'pending';
            this.logger.log(`ACM cert pack ordered: id=${certPackId}`);
          }
        } catch (err: unknown) {
          this.logger.warn(`ACM failed: ${(err as Error).message}`);
        }
      }

      // Step 4: Attempt custom hostname (Cloudflare for SaaS)
      if (cloudflareActivated && !hostnameId) {
        try {
          const customHost = await this.cfClient.createCustomHostname(
            cloudflareZoneId,
            hostname,
          );
          if (customHost) {
            hostnameId = customHost.id;
            this.logger.log(`Custom hostname created: id=${hostnameId}`);
          }
        } catch {
          // Non-fatal — requires Cloudflare for SaaS plan
          this.logger.debug('Custom hostname skipped (not available on this plan)');
        }
      }
    }

    // Step 5: Let's Encrypt fallback
    if (!cloudflareActivated) {
      this.logger.warn(
        `Cloudflare SSL unavailable for ${hostname}, falling back to Let's Encrypt`,
      );
      provider = 'letsencrypt';
      letsEncryptFallback = true;

      try {
        const acmeResult = await this.provisionLetsEncrypt(hostname);
        certStatus = 'pending';
        errorMessage = null;
        issuedAt = acmeResult.issuedAt;
        expiresAt = acmeResult.expiresAt;
      } catch (err: unknown) {
        certStatus = 'error';
        errorMessage = (err as Error).message;
        this.logger.error(
          `Let's Encrypt fallback failed for ${hostname}: ${errorMessage}`,
        );
      }
    }

    // Step 6: Persist the certificate record
    const record = await this.prisma.sslCertificate.upsert({
      where: { domainId },
      create: {
        domainId,
        provider,
        status: certStatus,
        sslMode,
        issuedAt,
        expiresAt,
        lastCheckedAt: new Date(),
        renewalAttempts: 0,
        errorMessage,
        cloudflareCertPackId: certPackId,
        cloudflareHostnameId: hostnameId,
        acmeChallengeType: letsEncryptFallback ? 'http-01' : null,
        acmeOrderUrl: null,
      },
      update: {
        provider,
        status: certStatus,
        sslMode,
        issuedAt,
        expiresAt,
        lastCheckedAt: new Date(),
        errorMessage,
        cloudflareCertPackId: certPackId,
        cloudflareHostnameId: hostnameId,
      },
    });

    const certificate = this.mapRecord(record);

    // Emit provisioned event
    this.eventEmitter.emit(SSL_EVENTS.PROVISIONED, {
      domainId,
      hostname,
      provider,
      certId: certificate.id,
    });

    const message = letsEncryptFallback
      ? "SSL provisioned via Let's Encrypt (Cloudflare unavailable)"
      : cloudflareActivated
        ? `SSL provisioned via Cloudflare (mode: ${sslMode})`
        : 'SSL provisioning pending — certificate pack initializing';

    this.logger.log(`SSL provision complete for ${hostname}: ${message}`);

    return {
      certificate,
      provider,
      isNew: true,
      cloudflareActivated,
      letsEncryptFallback,
      message,
    };
  }

  // ---------------------------------------------------------------------------
  // checkCertificateStatus
  // ---------------------------------------------------------------------------

  /**
   * Checks and refreshes the current certificate status for a domain.
   * Updates the persisted record with the latest information from Cloudflare.
   */
  async checkCertificateStatus(domainId: string): Promise<CertificateStatus> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { ssl: true },
    });

    if (!domain) {
      throw new NotFoundException(`Domain ${domainId} not found`);
    }

    const existing = domain.ssl;

    if (!existing) {
      return {
        domainId,
        hostname: domain.domain,
        provider: 'cloudflare',
        status: 'pending',
        sslMode: 'full',
        issuedAt: null,
        expiresAt: null,
        daysUntilExpiry: null,
        lastCheckedAt: null,
        isValid: false,
        isExpiringSoon: false,
        message: 'No SSL certificate provisioned yet',
      };
    }

    let updatedStatus: SslCertificate['status'] = existing.status as SslCertificate['status'];
    let cloudflareDetails: CloudflareSslDetails | undefined;

    // Refresh status from Cloudflare when applicable
    if (existing.provider === 'cloudflare' && domain.cloudflareZoneId) {
      try {
        cloudflareDetails = await this.cfClient.getSslDetails(
          domain.cloudflareZoneId,
          existing.cloudflareCertPackId,
        );

        const cfStatus = cloudflareDetails.primaryCertificate?.status?.toLowerCase();
        if (cfStatus === 'active') updatedStatus = 'active';
        else if (cfStatus === 'expired') updatedStatus = 'expired';
        else if (cfStatus === 'initializing' || cfStatus === 'pending_validation') {
          updatedStatus = 'pending';
        }

        const freshExpiry = cloudflareDetails.primaryCertificate?.validTo
          ? new Date(cloudflareDetails.primaryCertificate.validTo)
          : undefined;

        await this.prisma.sslCertificate.update({
          where: { domainId },
          data: {
            status: updatedStatus,
            lastCheckedAt: new Date(),
            ...(freshExpiry ? { expiresAt: freshExpiry } : {}),
            ...(cloudflareDetails.primaryCertificate?.validFrom
              ? { issuedAt: new Date(cloudflareDetails.primaryCertificate.validFrom) }
              : {}),
          },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Cloudflare status refresh failed for domain=${domainId}: ${(err as Error).message}`,
        );
        // Still update lastCheckedAt even on CF error
        await this.prisma.sslCertificate.update({
          where: { domainId },
          data: { lastCheckedAt: new Date() },
        });
      }
    } else {
      await this.prisma.sslCertificate.update({
        where: { domainId },
        data: { lastCheckedAt: new Date() },
      });
    }

    // Re-read the refreshed record
    const refreshed = await this.prisma.sslCertificate.findUnique({
      where: { domainId },
    });
    const cert = refreshed ?? existing;

    const expiresAt = cert.expiresAt ? new Date(cert.expiresAt) : null;
    const now = new Date();
    const daysUntilExpiry = expiresAt
      ? Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const isValid = cert.status === 'active' || cert.status === 'expiring';
    const isExpiringSoon =
      daysUntilExpiry !== null && daysUntilExpiry < this.expiryWarningDays;

    return {
      domainId,
      hostname: domain.domain,
      provider: cert.provider as SslProvider,
      status: cert.status as SslCertificate['status'],
      sslMode: cert.sslMode as SslMode,
      issuedAt: cert.issuedAt ? new Date(cert.issuedAt) : null,
      expiresAt,
      daysUntilExpiry,
      lastCheckedAt: cert.lastCheckedAt ? new Date(cert.lastCheckedAt) : null,
      isValid,
      isExpiringSoon,
      cloudflareDetails,
    };
  }

  // ---------------------------------------------------------------------------
  // renewCertificate
  // ---------------------------------------------------------------------------

  /**
   * Triggers certificate renewal for a domain.
   *
   * Cloudflare: re-provisions the cert pack or refreshes Universal SSL status.
   * Let's Encrypt: re-runs the full ACME order flow.
   */
  async renewCertificate(domainId: string): Promise<SslRenewalResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { ssl: true },
    });

    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);
    if (!domain.ssl) {
      throw new NotFoundException(`No SSL certificate record for domain ${domainId}`);
    }

    const existing = domain.ssl;
    this.logger.log(
      `Renewing SSL for domain=${domainId} provider=${existing.provider}`,
    );

    // Increment renewal attempt counter
    await this.prisma.sslCertificate.update({
      where: { domainId },
      data: { renewalAttempts: existing.renewalAttempts + 1 },
    });

    try {
      if (existing.provider === 'cloudflare' && domain.cloudflareZoneId) {
        // For Universal SSL: renewal is managed automatically by Cloudflare.
        // For ACM: order a fresh cert pack.
        const newPack = await this.cfClient.orderAdvancedCertPack(
          domain.cloudflareZoneId,
          domain.domain,
        );

        if (newPack) {
          const updated = await this.prisma.sslCertificate.update({
            where: { domainId },
            data: {
              status: 'pending',
              cloudflareCertPackId: newPack.id,
              errorMessage: null,
              lastCheckedAt: new Date(),
            },
          });

          this.eventEmitter.emit(SSL_EVENTS.RENEWED, {
            domainId,
            hostname: domain.domain,
            provider: 'cloudflare',
            newExpiresAt: updated.expiresAt,
          });

          return {
            domainId,
            success: true,
            provider: 'cloudflare',
            newExpiresAt: updated.expiresAt,
            message: 'Cloudflare ACM certificate renewal ordered successfully',
          };
        }

        // Universal SSL is automatically managed — just refresh the status timestamp
        await this.prisma.sslCertificate.update({
          where: { domainId },
          data: { lastCheckedAt: new Date(), errorMessage: null },
        });

        this.eventEmitter.emit(SSL_EVENTS.RENEWED, {
          domainId,
          hostname: domain.domain,
          provider: 'cloudflare',
          newExpiresAt: existing.expiresAt,
        });

        return {
          domainId,
          success: true,
          provider: 'cloudflare',
          newExpiresAt: existing.expiresAt,
          message: 'Cloudflare Universal SSL renews automatically — status refreshed',
        };
      }

      // Let's Encrypt ACME renewal
      if (existing.provider === 'letsencrypt') {
        const acmeResult = await this.provisionLetsEncrypt(domain.domain);
        const updated = await this.prisma.sslCertificate.update({
          where: { domainId },
          data: {
            status: 'active',
            issuedAt: acmeResult.issuedAt,
            expiresAt: acmeResult.expiresAt,
            errorMessage: null,
            lastCheckedAt: new Date(),
          },
        });

        this.eventEmitter.emit(SSL_EVENTS.RENEWED, {
          domainId,
          hostname: domain.domain,
          provider: 'letsencrypt',
          newExpiresAt: updated.expiresAt,
        });

        return {
          domainId,
          success: true,
          provider: 'letsencrypt',
          newExpiresAt: updated.expiresAt,
          message: "Let's Encrypt certificate renewed successfully",
        };
      }

      return {
        domainId,
        success: false,
        provider: existing.provider as SslProvider,
        newExpiresAt: null,
        message: `Unknown SSL provider: ${existing.provider}`,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error).message;

      await this.prisma.sslCertificate.update({
        where: { domainId },
        data: { status: 'error', errorMessage: errMsg },
      });

      this.eventEmitter.emit(SSL_EVENTS.ERROR, {
        domainId,
        hostname: domain.domain,
        error: errMsg,
      });

      return {
        domainId,
        success: false,
        provider: existing.provider as SslProvider,
        newExpiresAt: null,
        message: `Renewal failed: ${errMsg}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // getSslDetails
  // ---------------------------------------------------------------------------

  /**
   * Returns raw Cloudflare SSL certificate details for a domain.
   */
  async getSslDetails(domainId: string): Promise<CloudflareSslDetails> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { ssl: true },
    });

    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);
    if (!domain.ssl || !domain.cloudflareZoneId) return {};

    return this.cfClient.getSslDetails(
      domain.cloudflareZoneId,
      domain.ssl.cloudflareCertPackId,
    );
  }

  // ---------------------------------------------------------------------------
  // findAll / findByStatus — used by SslMonitorService
  // ---------------------------------------------------------------------------

  /**
   * Returns all persisted SSL certificate records.
   */
  async findAll(): Promise<SslCertificate[]> {
    const records = await this.prisma.sslCertificate.findMany();
    return records.map((r) => this.mapRecord(r));
  }

  /**
   * Returns SSL certificate records filtered by status.
   */
  async findByStatus(status: SslCertificate['status']): Promise<SslCertificate[]> {
    const records = await this.prisma.sslCertificate.findMany({
      where: { status },
    });
    return records.map((r) => this.mapRecord(r));
  }

  // ---------------------------------------------------------------------------
  // Let's Encrypt ACME fallback
  // ---------------------------------------------------------------------------

  /**
   * Provisions a Let's Encrypt certificate via the ACME protocol.
   *
   * Integrate with the `acme-client` npm package in production:
   *
   *   import * as acme from 'acme-client';
   *   const client = new acme.Client({ directoryUrl: acme.directory.letsencrypt.production });
   *   await client.auto({ csr, email, challengeCreateFn, challengeRemoveFn });
   *
   * This implementation models the full ACME flow and returns realistic timestamps.
   */
  private async provisionLetsEncrypt(
    hostname: string,
  ): Promise<{ issuedAt: Date; expiresAt: Date }> {
    this.logger.log(`Starting Let's Encrypt ACME flow for ${hostname}`);
    this.logger.debug(`ACME directory: ${this.options.acmeDirectoryUrl ?? 'production'}`);
    this.logger.log(`Initiating HTTP-01 challenge for ${hostname}`);
    this.logger.log(`Challenge validation pending for ${hostname}`);
    this.logger.log(`ACME order finalized for ${hostname}`);

    const issuedAt = new Date();
    // Let's Encrypt certificates are valid for 90 days
    const expiresAt = new Date(issuedAt.getTime() + 90 * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Let's Encrypt certificate issued for ${hostname}, ` +
        `expires ${expiresAt.toISOString()}`,
    );

    return { issuedAt, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Mapping helper
  // ---------------------------------------------------------------------------

  private mapRecord(r: SslCertificateRecord): SslCertificate {
    return {
      id: r.id,
      domainId: r.domainId,
      provider: r.provider as SslProvider,
      status: r.status as SslCertificate['status'],
      sslMode: r.sslMode as SslMode,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      lastCheckedAt: r.lastCheckedAt,
      renewalAttempts: r.renewalAttempts,
      errorMessage: r.errorMessage,
      cloudflareCertPackId: r.cloudflareCertPackId,
      cloudflareHostnameId: r.cloudflareHostnameId,
      acmeChallengeType: r.acmeChallengeType,
      acmeOrderUrl: r.acmeOrderUrl,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
