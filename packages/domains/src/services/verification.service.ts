// VerificationService — domain ownership verification state machine
// TypeScript 5.5+, ES2022, strict mode

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DOMAINS_MODULE_OPTIONS, DOMAINS_PRISMA_SERVICE } from '../domains.constants.js';
import {
  DEFAULT_VERIFICATION_CONFIG,
  DomainVerificationFailedEvent,
  DomainVerifiedEvent,
  VALID_TRANSITIONS,
  VerificationConfig,
  VerificationError,
  VerificationRecord,
  VerificationResult,
  VerificationStatus,
  VerificationStatusValue,
} from '../types/verification.types.js';
import type { DomainsModuleOptions } from '../types/domains.types.js';
import { DnsLookupService } from './dns-lookup.service.js';

// ─── Minimal Prisma surface ───────────────────────────────────────────────────

interface PrismaVerificationClient {
  domainVerification: {
    create(args: { data: Record<string, unknown> }): Promise<VerificationRecord>;
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<VerificationRecord | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<VerificationRecord | null>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<VerificationRecord>;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly config: VerificationConfig;

  constructor(
    @Inject(DOMAINS_PRISMA_SERVICE)
    private readonly prisma: PrismaVerificationClient,
    private readonly dnsLookup: DnsLookupService,
    @Optional()
    @Inject(DOMAINS_MODULE_OPTIONS)
    options: DomainsModuleOptions = { cloudflare: { apiToken: '', platformHostname: '' } },
  ) {
    // Merge only the verification-config keys that the host may have provided
    const verificationOpts: Partial<VerificationConfig> = {
      pollIntervalMs: (options as Record<string, unknown>)['pollIntervalMs'] as number | undefined,
      maxAttempts: (options as Record<string, unknown>)['maxAttempts'] as number | undefined,
      exponentialBackoff: (options as Record<string, unknown>)['exponentialBackoff'] as boolean | undefined,
      maxPollIntervalMs: (options as Record<string, unknown>)['maxPollIntervalMs'] as number | undefined,
      maxStartsPerHour: (options as Record<string, unknown>)['maxStartsPerHour'] as number | undefined,
      txtRecordPrefix: (options as Record<string, unknown>)['txtRecordPrefix'] as string | undefined,
    };
    // Remove undefined keys so defaults are preserved
    for (const key of Object.keys(verificationOpts) as (keyof VerificationConfig)[]) {
      if (verificationOpts[key] === undefined) {
        delete verificationOpts[key];
      }
    }
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...verificationOpts };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Generate a unique TXT record value.
   * Format: "<prefix>=<uuid>"
   */
  generateVerificationRecord(prefixOverride?: string): string {
    const prefix = prefixOverride ?? this.config.txtRecordPrefix;
    return `${prefix}=${randomUUID()}`;
  }

  /**
   * Create a new verification entry for a domain.
   *
   * Rate-limiting: throws `VerificationError` with code `RATE_LIMITED` if the
   * domain has exceeded `maxStartsPerHour` within the current 1-hour window.
   *
   * @param domainId - The owning domain's entity ID in your system
   * @param domain   - The domain name, e.g. "example.com"
   * @returns New VerificationRecord in PENDING status
   */
  async startVerification(domainId: string, domain: string): Promise<VerificationRecord> {
    await this.enforceRateLimit(domainId);

    const txtRecord = this.generateVerificationRecord();
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Determine rate-limit window values for this new record
    const latest = await this.prisma.domainVerification.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' } as Record<string, unknown>,
    });

    const isNewWindow =
      !latest?.rateLimitResetAt || now >= latest.rateLimitResetAt;

    const startCount = isNewWindow ? 1 : (latest?.startCount ?? 0) + 1;
    const rateLimitResetAt = isNewWindow
      ? oneHourFromNow
      : (latest?.rateLimitResetAt ?? oneHourFromNow);

    const record = await this.prisma.domainVerification.create({
      data: {
        domainId,
        domain,
        txtRecord,
        status: VerificationStatus.PENDING,
        attempts: 0,
        maxAttempts: this.config.maxAttempts,
        lastCheckedAt: null,
        verifiedAt: null,
        activatedAt: null,
        rateLimitResetAt,
        startCount,
        createdAt: now,
        updatedAt: now,
      },
    });

    this.logger.log(
      `Verification started — domain="${domain}" domainId=${domainId} record="${txtRecord}"`,
    );
    return record;
  }

  /**
   * Perform a single DNS check for the given verification record.
   *
   * State transitions on this call:
   * - PENDING    -> VERIFYING (first check, record not yet found)
   * - VERIFYING  -> VERIFIED  (TXT record matched)
   * - VERIFYING  -> FAILED    (maxAttempts reached without match)
   *
   * Callbacks `onVerified` / `onFailed` are invoked synchronously before returning.
   * Use them to emit NestJS events (or call webhooks) without coupling this service
   * to the event emitter.
   *
   * @returns The updated VerificationRecord
   */
  async checkVerification(
    verificationId: string,
    onVerified?: (event: DomainVerifiedEvent) => void,
    onFailed?: (event: DomainVerificationFailedEvent) => void,
  ): Promise<VerificationRecord> {
    const record = await this.findOrThrow(verificationId);

    // Terminal / inactive states — nothing to do
    if (
      record.status === VerificationStatus.ACTIVE ||
      record.status === VerificationStatus.FAILED ||
      record.status === VerificationStatus.CANCELLED
    ) {
      return record;
    }

    const now = new Date();
    const newAttempts = record.attempts + 1;

    // PENDING transitions to VERIFYING on the first poll
    const currentStatus: VerificationStatusValue =
      record.status === VerificationStatus.PENDING
        ? VerificationStatus.VERIFYING
        : record.status;

    const dnsResult: VerificationResult = await this.dnsLookup.checkVerificationRecord(
      record.domain,
      record.txtRecord,
    );

    let nextStatus: VerificationStatusValue = currentStatus;
    let verifiedAt: Date | null = record.verifiedAt;

    if (dnsResult.matched) {
      nextStatus = VerificationStatus.VERIFIED;
      verifiedAt = now;
      this.logger.log(
        `TXT record matched — domain="${record.domain}" attempts=${newAttempts}`,
      );
    } else if (newAttempts >= record.maxAttempts) {
      nextStatus = VerificationStatus.FAILED;
      this.logger.warn(
        `Verification failed — domain="${record.domain}" maxAttempts=${record.maxAttempts} reached`,
      );
    }

    const updated = await this.prisma.domainVerification.update({
      where: { id: verificationId },
      data: {
        status: nextStatus,
        attempts: newAttempts,
        lastCheckedAt: now,
        verifiedAt,
        updatedAt: now,
      },
    });

    if (nextStatus === VerificationStatus.VERIFIED && verifiedAt) {
      onVerified?.({
        domainId: record.domainId,
        domain: record.domain,
        txtRecord: record.txtRecord,
        verifiedAt,
      });
    }

    if (nextStatus === VerificationStatus.FAILED) {
      onFailed?.({
        domainId: record.domainId,
        domain: record.domain,
        txtRecord: record.txtRecord,
        attempts: newAttempts,
        failedAt: now,
      });
    }

    return updated;
  }

  /**
   * Transition a VERIFIED record to ACTIVE.
   * Call this after any post-verification steps (e.g. DNS CNAME setup).
   */
  async activateVerification(verificationId: string): Promise<VerificationRecord> {
    const record = await this.findOrThrow(verificationId);

    if (record.status === VerificationStatus.ACTIVE) {
      throw new VerificationError(
        `Verification ${verificationId} is already active`,
        'ALREADY_ACTIVE',
        record.domainId,
      );
    }

    this.assertValidTransition(record.status, VerificationStatus.ACTIVE);

    const now = new Date();
    return this.prisma.domainVerification.update({
      where: { id: verificationId },
      data: { status: VerificationStatus.ACTIVE, activatedAt: now, updatedAt: now },
    });
  }

  /**
   * Cancel an in-progress verification.
   * Valid from PENDING or VERIFYING states.
   */
  async cancelVerification(verificationId: string): Promise<VerificationRecord> {
    const record = await this.findOrThrow(verificationId);
    this.assertValidTransition(record.status, VerificationStatus.CANCELLED);

    const now = new Date();
    return this.prisma.domainVerification.update({
      where: { id: verificationId },
      data: { status: VerificationStatus.CANCELLED, updatedAt: now },
    });
  }

  /**
   * Retrieve a verification record by ID.
   */
  async getVerification(verificationId: string): Promise<VerificationRecord | null> {
    return this.prisma.domainVerification.findUnique({ where: { id: verificationId } });
  }

  /**
   * Get the most recent verification record for a domain.
   */
  async getLatestForDomain(domainId: string): Promise<VerificationRecord | null> {
    return this.prisma.domainVerification.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' } as Record<string, unknown>,
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async findOrThrow(verificationId: string): Promise<VerificationRecord> {
    const record = await this.prisma.domainVerification.findUnique({
      where: { id: verificationId },
    });
    if (!record) {
      throw new VerificationError(
        `Verification record "${verificationId}" not found`,
        'NOT_FOUND',
      );
    }
    return record;
  }

  private assertValidTransition(
    from: VerificationStatusValue,
    to: VerificationStatusValue,
  ): void {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!(allowed as readonly string[]).includes(to)) {
      throw new VerificationError(
        `Invalid state transition: ${from} -> ${to}`,
        'INVALID_TRANSITION',
      );
    }
  }

  private async enforceRateLimit(domainId: string): Promise<void> {
    const now = new Date();

    const latest = await this.prisma.domainVerification.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' } as Record<string, unknown>,
    });

    if (!latest) return; // first verification for this domain — always allowed

    const windowActive =
      latest.rateLimitResetAt !== null && now < latest.rateLimitResetAt;

    if (windowActive && latest.startCount >= this.config.maxStartsPerHour) {
      const resetIn = Math.ceil(
        ((latest.rateLimitResetAt as Date).getTime() - now.getTime()) / 1000,
      );
      throw new VerificationError(
        `Rate limit exceeded: max ${this.config.maxStartsPerHour} verification starts per hour ` +
          `for domain ${domainId}. Retry in ${resetIn}s.`,
        'RATE_LIMITED',
        domainId,
      );
    }
  }
}
