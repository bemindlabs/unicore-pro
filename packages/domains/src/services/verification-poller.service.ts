// VerificationPollerService — background DNS polling with configurable interval & back-off
// TypeScript 5.5+, ES2022, strict mode

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DOMAINS_MODULE_OPTIONS } from '../domains.constants.js';
import {
  DEFAULT_VERIFICATION_CONFIG,
  DomainVerificationFailedEvent,
  DomainVerifiedEvent,
  VerificationConfig,
  VerificationRecord,
  VerificationStatus,
} from '../types/verification.types.js';
import type { DomainsModuleOptions } from '../types/domains.types.js';
import { VerificationService } from './verification.service.js';
import { VerificationEventsService } from './verification-events.service.js';

// ─── Internal poller entry ────────────────────────────────────────────────────

interface PollerEntry {
  verificationId: string;
  domainId: string;
  domain: string;
  /** Number of poll cycles already completed (used for back-off calculation) */
  cycle: number;
  timer: ReturnType<typeof setTimeout> | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VerificationPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationPollerService.name);
  private readonly config: VerificationConfig;

  /** Active pollers keyed by verificationId */
  private readonly pollers = new Map<string, PollerEntry>();

  constructor(
    private readonly verificationService: VerificationService,
    private readonly eventsService: VerificationEventsService,
    @Optional()
    @Inject(DOMAINS_MODULE_OPTIONS)
    options: DomainsModuleOptions = { cloudflare: { apiToken: '', platformHostname: '' } },
  ) {
    const verificationOpts: Partial<VerificationConfig> = {
      pollIntervalMs: (options as Record<string, unknown>)['pollIntervalMs'] as number | undefined,
      maxAttempts: (options as Record<string, unknown>)['maxAttempts'] as number | undefined,
      exponentialBackoff: (options as Record<string, unknown>)['exponentialBackoff'] as boolean | undefined,
      maxPollIntervalMs: (options as Record<string, unknown>)['maxPollIntervalMs'] as number | undefined,
    };
    for (const key of Object.keys(verificationOpts) as (keyof VerificationConfig)[]) {
      if (verificationOpts[key] === undefined) delete verificationOpts[key];
    }
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...verificationOpts };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.logger.log(
      `VerificationPollerService ready — ` +
        `interval=${this.config.pollIntervalMs}ms, ` +
        `maxAttempts=${this.config.maxAttempts}, ` +
        `exponentialBackoff=${this.config.exponentialBackoff}`,
    );
  }

  onModuleDestroy(): void {
    this.stopAll();
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Start polling DNS for the given verification record.
   * No-op if already polling for the same ID.
   */
  startPolling(record: VerificationRecord): void {
    if (this.pollers.has(record.id)) {
      this.logger.debug(`Already polling verificationId=${record.id} — skipping`);
      return;
    }

    const entry: PollerEntry = {
      verificationId: record.id,
      domainId: record.domainId,
      domain: record.domain,
      cycle: record.attempts,
      timer: null,
    };

    this.pollers.set(record.id, entry);
    this.logger.log(
      `Poller started — domain="${record.domain}" verificationId=${record.id}`,
    );
    this.scheduleNext(entry);
  }

  /**
   * Stop polling for a specific verification record.
   */
  stopPolling(verificationId: string): void {
    const entry = this.pollers.get(verificationId);
    if (!entry) return;

    if (entry.timer !== null) clearTimeout(entry.timer);
    this.pollers.delete(verificationId);
    this.logger.log(`Poller stopped — verificationId=${verificationId}`);
  }

  /** Stop all active pollers (called on module shutdown). */
  stopAll(): void {
    const ids = [...this.pollers.keys()];
    for (const id of ids) this.stopPolling(id);
  }

  /** Number of currently active pollers. */
  get activeCount(): number {
    return this.pollers.size;
  }

  // ─── Internal polling ─────────────────────────────────────────────────────────

  private scheduleNext(entry: PollerEntry): void {
    const delay = this.computeDelay(entry.cycle);
    entry.timer = setTimeout(() => {
      void this.poll(entry);
    }, delay);
  }

  private async poll(entry: PollerEntry): Promise<void> {
    if (!this.pollers.has(entry.verificationId)) {
      return; // was stopped while waiting
    }

    entry.cycle += 1;

    try {
      const updated = await this.verificationService.checkVerification(
        entry.verificationId,
        (event: DomainVerifiedEvent) => this.eventsService.emitVerified(event),
        (event: DomainVerificationFailedEvent) => this.eventsService.emitVerificationFailed(event),
      );

      // Stop polling when a terminal / satisfied state is reached
      const terminalStates = [
        VerificationStatus.VERIFIED,
        VerificationStatus.ACTIVE,
        VerificationStatus.FAILED,
        VerificationStatus.CANCELLED,
      ] as string[];

      if (terminalStates.includes(updated.status)) {
        this.stopPolling(entry.verificationId);
        return;
      }

      // Still pending/verifying — schedule next poll
      this.scheduleNext(entry);
    } catch (err: unknown) {
      this.logger.error(
        `Poll error for verificationId=${entry.verificationId}: ${(err as Error).message}`,
      );
      // On transient error, continue polling if the entry is still active
      if (this.pollers.has(entry.verificationId)) {
        this.scheduleNext(entry);
      }
    }
  }

  /**
   * Compute the delay before the next poll.
   * With exponential back-off: min(baseInterval * 2^cycle, maxPollIntervalMs)
   */
  private computeDelay(cycle: number): number {
    if (!this.config.exponentialBackoff || cycle === 0) {
      return this.config.pollIntervalMs;
    }
    const exponential = this.config.pollIntervalMs * Math.pow(2, cycle);
    return Math.min(exponential, this.config.maxPollIntervalMs);
  }
}
