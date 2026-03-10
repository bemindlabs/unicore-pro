/**
 * SslMonitorService — periodic SSL certificate health checker for @unicore/domains.
 */

import { Injectable, Logger, Inject, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SslService } from './ssl.service.js';
import { SSL_MODULE_OPTIONS, DEFAULT_EXPIRY_WARNING_DAYS, DEFAULT_MONITOR_INTERVAL_MS } from '../ssl.constants.js';
import { SSL_EVENTS } from '../events/ssl.events.js';
import type { SslModuleOptions, SslCertificate } from '../types/ssl.types.js';

@Injectable()
export class SslMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(SslMonitorService.name);
  private readonly intervalMs: number;
  private readonly expiryWarningDays: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(SSL_MODULE_OPTIONS) private readonly options: SslModuleOptions,
    private readonly sslService: SslService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.intervalMs = options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
    this.expiryWarningDays = options.expiryWarningDays ?? DEFAULT_EXPIRY_WARNING_DAYS;
  }

  startMonitoring(): void {
    if (this.timer) { this.logger.warn('SslMonitorService already running'); return; }
    this.logger.log(`Starting SSL monitor (interval=${this.intervalMs}ms, expiryWarningDays=${this.expiryWarningDays})`);
    void this.runCheck().catch((err: unknown) => this.logger.error(`SSL monitor initial check failed: ${(err as Error).message}`));
    this.timer = setInterval(() => {
      void this.runCheck().catch((err: unknown) => this.logger.error(`SSL monitor cycle failed: ${(err as Error).message}`));
    }, this.intervalMs);
  }

  stopMonitoring(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; this.logger.log('SSL monitor stopped'); }
  }

  onModuleDestroy(): void { this.stopMonitoring(); }

  async runCheck(): Promise<{ checked: number; warnings: number; expired: number }> {
    this.logger.debug('SSL monitor cycle started');
    let certs: SslCertificate[];
    try {
      certs = await this.sslService.findAll();
    } catch (err: unknown) {
      this.logger.error(`SSL monitor: failed to load certificates: ${(err as Error).message}`);
      return { checked: 0, warnings: 0, expired: 0 };
    }

    this.logger.debug(`SSL monitor: checking ${certs.length} certificate(s)`);
    const now = new Date();
    const warningThresholdMs = this.expiryWarningDays * 24 * 60 * 60 * 1000;
    let warnings = 0;
    let expired = 0;

    const results = await Promise.allSettled(certs.map(cert => this.checkOneCert(cert, now, warningThresholdMs)));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'warning') warnings++;
        if (result.value === 'expired') expired++;
      } else {
        this.logger.warn(`SSL monitor: certificate check error: ${(result.reason as Error).message}`);
      }
    }

    this.logger.debug(`SSL monitor cycle complete: ${certs.length} checked, ${warnings} warning(s), ${expired} expired`);
    return { checked: certs.length, warnings, expired };
  }

  private async checkOneCert(cert: SslCertificate, now: Date, warningThresholdMs: number): Promise<'ok' | 'warning' | 'expired' | 'skipped'> {
    const fiveMinutes = 5 * 60 * 1000;
    const lastCheck = cert.lastCheckedAt?.getTime() ?? 0;
    const isCritical = cert.status === 'expiring' || cert.status === 'expired' || cert.status === 'pending';

    if (!isCritical && now.getTime() - lastCheck < fiveMinutes) return 'skipped';

    let status: { hostname: string; expiresAt: Date | null };
    try {
      status = await this.sslService.checkCertificateStatus(cert.domainId);
    } catch (err: unknown) {
      this.logger.warn(`SSL monitor: could not check domain=${cert.domainId}: ${(err as Error).message}`);
      return 'skipped';
    }

    if (!status.expiresAt) return 'ok';
    const msUntilExpiry = status.expiresAt.getTime() - now.getTime();

    if (msUntilExpiry <= 0) {
      this.logger.warn(`SSL EXPIRED for domain=${cert.domainId} hostname=${status.hostname}`);
      this.eventEmitter.emit(SSL_EVENTS.EXPIRED, { domainId: cert.domainId, hostname: status.hostname, provider: cert.provider, expiredAt: status.expiresAt });
      return 'expired';
    }

    if (msUntilExpiry <= warningThresholdMs) {
      const daysLeft = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      this.logger.warn(`SSL expiring in ${daysLeft} day(s): domain=${cert.domainId} hostname=${status.hostname}`);
      this.eventEmitter.emit(SSL_EVENTS.EXPIRY_WARNING, { domainId: cert.domainId, hostname: status.hostname, provider: cert.provider, expiresAt: status.expiresAt, daysUntilExpiry: daysLeft });
      return 'warning';
    }

    return 'ok';
  }
}
