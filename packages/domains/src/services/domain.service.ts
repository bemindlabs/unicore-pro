/**
 * DomainService — core business logic for custom domain management.
 *
 * Responsibilities:
 *  - addDomain: register a custom domain for a tenant, generate TXT verification token.
 *  - verifyOwnership: query DNS to confirm TXT record presence, update status.
 *  - configureDns: create CNAME record pointing the custom domain at the platform hostname.
 *  - removeDomain: delete DNS records from Cloudflare and remove DB record.
 *  - listDomains / getDomain: read operations.
 */

import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { CloudflareClient } from './cloudflare.client.js';
import {
  DOMAINS_MODULE_OPTIONS,
  DOMAINS_PRISMA_SERVICE,
  DEFAULT_TXT_RECORD_PREFIX,
} from '../domains.constants.js';
import type {
  DomainsModuleOptions,
  AddDomainDto,
  DomainResponseDto,
  ListDomainsOptions,
  ConfigureDnsResult,
  VerifyOwnershipResult,
  Domain,
} from '../types/domains.types.js';

// ---------------------------------------------------------------------------
// Minimal Prisma client interface (avoids hard dependency on generated client)
// ---------------------------------------------------------------------------

interface PrismaLike {
  domain: {
    findUnique(args: { where: { id: string } | { domain: string } }): Promise<Domain | null>;
    findMany(args: { where: Record<string, unknown>; take?: number; skip?: number }): Promise<Domain[]>;
    create(args: { data: Record<string, unknown> }): Promise<Domain>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Domain>;
    delete(args: { where: { id: string } }): Promise<Domain>;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);
  private readonly txtRecordPrefix: string;

  constructor(
    @Inject(DOMAINS_PRISMA_SERVICE) private readonly prisma: PrismaLike,
    @Inject(DOMAINS_MODULE_OPTIONS) private readonly options: DomainsModuleOptions,
    private readonly cloudflareClient: CloudflareClient,
  ) {
    this.txtRecordPrefix = options.txtRecordPrefix ?? DEFAULT_TXT_RECORD_PREFIX;
  }

  // ---------------------------------------------------------------------------
  // addDomain
  // ---------------------------------------------------------------------------

  /**
   * Registers a new custom domain for a tenant.
   *
   * - Validates the domain is not already registered.
   * - Generates a unique TXT verification token.
   * - Persists the domain record with status=pending.
   * - Attempts Cloudflare zone lookup and stores the zone ID if found.
   *
   * Returns the domain record including the TXT record the customer must add.
   */
  async addDomain(dto: AddDomainDto): Promise<DomainResponseDto> {
    const normalizedDomain = this.normalizeDomain(dto.domain);

    const existing = await this.prisma.domain.findUnique({
      where: { domain: normalizedDomain },
    });
    if (existing) {
      throw new ConflictException(
        `Domain "${normalizedDomain}" is already registered (id=${existing.id}).`,
      );
    }

    const txtVerificationRecord = this.generateVerificationToken(normalizedDomain);

    // Attempt zone lookup upfront — non-fatal if zone not found yet
    let cloudflareZoneId: string | null = null;
    try {
      const zone = await this.cloudflareClient.findZoneForDomain(normalizedDomain);
      cloudflareZoneId = zone.id;
    } catch {
      this.logger.warn(
        `Zone lookup skipped for "${normalizedDomain}" — will retry on configureDns.`,
      );
    }

    const record = await this.prisma.domain.create({
      data: {
        domain: normalizedDomain,
        tenantId: dto.tenantId,
        status: 'pending',
        sslStatus: 'pending',
        txtVerificationRecord,
        cloudflareZoneId,
      },
    });

    this.logger.log(`Domain added: ${record.id} (${normalizedDomain}) for tenant ${dto.tenantId}`);
    return this.toResponseDto(record);
  }

  // ---------------------------------------------------------------------------
  // verifyOwnership
  // ---------------------------------------------------------------------------

  /**
   * Checks DNS TXT records to verify the tenant controls the domain.
   *
   * - Resolves TXT records on `<txtRecordPrefix>.<domain>`.
   * - If the expected token is found, transitions status: pending/verifying → verified.
   * - Updates `verifiedAt` timestamp on success.
   */
  async verifyOwnership(domainId: string): Promise<VerifyOwnershipResult> {
    const record = await this.findOrThrow(domainId);

    if (record.status === 'active') {
      return {
        verified: true,
        domain: record.domain,
        expectedRecord: record.txtVerificationRecord,
        message: 'Domain is already active.',
      };
    }

    // Transition to verifying
    await this.prisma.domain.update({
      where: { id: domainId },
      data: { status: 'verifying' },
    });

    const txtName = `${this.txtRecordPrefix}.${record.domain}`;
    let foundRecord: string | undefined;
    let verified = false;

    try {
      const txtRecords = await dns.resolveTxt(txtName);
      // resolveTxt returns string[][] (each TXT record can have multiple strings)
      const allValues = txtRecords.flat();
      foundRecord = allValues.find((v) => v === record.txtVerificationRecord);
      verified = foundRecord !== undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DNS TXT lookup failed for ${txtName}: ${message}`);
    }

    if (verified) {
      await this.prisma.domain.update({
        where: { id: domainId },
        data: { status: 'verified', verifiedAt: new Date() },
      });
      this.logger.log(`Domain ${record.domain} ownership verified.`);
    } else {
      await this.prisma.domain.update({
        where: { id: domainId },
        data: { status: 'pending' },
      });
      this.logger.warn(`Domain ${record.domain} ownership verification failed.`);
    }

    return {
      verified,
      domain: record.domain,
      expectedRecord: record.txtVerificationRecord,
      foundRecord,
      message: verified
        ? `TXT record confirmed at ${txtName}.`
        : `Expected TXT value not found at ${txtName}. Ensure you've added the record and allow time for DNS propagation.`,
    };
  }

  // ---------------------------------------------------------------------------
  // configureDns
  // ---------------------------------------------------------------------------

  /**
   * Creates a CNAME record in Cloudflare pointing the custom domain at the
   * platform hostname (from `CloudflareConfig.platformHostname`).
   *
   * Prerequisites: domain must be in 'verified' status.
   * Post-condition: domain transitions to 'active'.
   */
  async configureDns(domainId: string): Promise<ConfigureDnsResult> {
    const record = await this.findOrThrow(domainId);

    if (record.status !== 'verified') {
      throw new BadRequestException(
        `Domain "${record.domain}" must be verified before DNS can be configured. ` +
        `Current status: ${record.status}.`,
      );
    }

    const platformHostname = this.options.cloudflare.platformHostname;

    // Ensure we have a zone ID
    let zoneId = record.cloudflareZoneId;
    if (!zoneId) {
      const zone = await this.cloudflareClient.findZoneForDomain(record.domain);
      zoneId = zone.id;
      await this.prisma.domain.update({
        where: { id: domainId },
        data: { cloudflareZoneId: zoneId },
      });
    }

    // If a DNS record already exists, update it; otherwise create
    let dnsRecordId = record.cloudflareDnsRecordId;
    let proxied = true;

    if (dnsRecordId) {
      await this.cloudflareClient.updateDnsRecord({
        zoneId,
        recordId: dnsRecordId,
        type: 'CNAME',
        name: record.domain,
        content: platformHostname,
        ttl: 1,
        proxied,
        comment: `Managed by @unicore/domains — tenant ${record.tenantId}`,
      });
      this.logger.log(`Updated CNAME for ${record.domain} → ${platformHostname}`);
    } else {
      const dnsRecord = await this.cloudflareClient.createDnsRecord({
        zoneId,
        type: 'CNAME',
        name: record.domain,
        content: platformHostname,
        ttl: 1,
        proxied,
        comment: `Managed by @unicore/domains — tenant ${record.tenantId}`,
      });
      dnsRecordId = dnsRecord.id;
      this.logger.log(`Created CNAME for ${record.domain} → ${platformHostname} (record ${dnsRecordId})`);
    }

    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        status: 'active',
        cloudflareZoneId: zoneId,
        cloudflareDnsRecordId: dnsRecordId,
        sslStatus: 'active', // Cloudflare Universal SSL activates automatically when proxied
      },
    });

    return {
      domain: record.domain,
      cnameTarget: platformHostname,
      cloudflareZoneId: zoneId,
      cloudflareDnsRecordId: dnsRecordId,
      proxied,
    };
  }

  // ---------------------------------------------------------------------------
  // removeDomain
  // ---------------------------------------------------------------------------

  /**
   * Removes a custom domain:
   *  1. Deletes the managed CNAME record from Cloudflare (if present).
   *  2. Deletes the domain record from the database.
   */
  async removeDomain(domainId: string): Promise<void> {
    const record = await this.findOrThrow(domainId);

    if (record.cloudflareZoneId && record.cloudflareDnsRecordId) {
      try {
        await this.cloudflareClient.deleteDnsRecord(
          record.cloudflareZoneId,
          record.cloudflareDnsRecordId,
        );
        this.logger.log(
          `Deleted Cloudflare DNS record ${record.cloudflareDnsRecordId} for ${record.domain}`,
        );
      } catch (err) {
        // Log but don't block deletion — the record may have been removed manually
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to delete Cloudflare DNS record for ${record.domain}: ${message}`);
      }
    }

    await this.prisma.domain.delete({ where: { id: domainId } });
    this.logger.log(`Domain removed: ${domainId} (${record.domain})`);
  }

  // ---------------------------------------------------------------------------
  // listDomains
  // ---------------------------------------------------------------------------

  async listDomains(opts: ListDomainsOptions): Promise<DomainResponseDto[]> {
    const where: Record<string, unknown> = { tenantId: opts.tenantId };
    if (opts.status) where['status'] = opts.status;

    const records = await this.prisma.domain.findMany({
      where,
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });

    return records.map((r) => this.toResponseDto(r));
  }

  // ---------------------------------------------------------------------------
  // getDomain
  // ---------------------------------------------------------------------------

  async getDomain(domainId: string): Promise<DomainResponseDto> {
    const record = await this.findOrThrow(domainId);
    return this.toResponseDto(record);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOrThrow(domainId: string): Promise<Domain> {
    const record = await this.prisma.domain.findUnique({ where: { id: domainId } });
    if (!record) {
      throw new NotFoundException(`Domain ${domainId} not found.`);
    }
    return record;
  }

  private normalizeDomain(domain: string): string {
    return domain.trim().toLowerCase().replace(/\.$/, '');
  }

  private generateVerificationToken(domain: string): string {
    const random = randomBytes(24).toString('hex');
    // Include a hash of the domain for readability/traceability
    return `unicore-verify=${random}`;
  }

  private toResponseDto(record: Domain): DomainResponseDto {
    const txtRecordName = `${this.txtRecordPrefix}.${record.domain}`;
    return {
      id: record.id,
      domain: record.domain,
      tenantId: record.tenantId,
      status: record.status,
      verifiedAt: record.verifiedAt,
      sslStatus: record.sslStatus,
      txtVerificationRecord: record.txtVerificationRecord,
      txtRecordName,
      cloudflareZoneId: record.cloudflareZoneId,
      cloudflareDnsRecordId: record.cloudflareDnsRecordId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
