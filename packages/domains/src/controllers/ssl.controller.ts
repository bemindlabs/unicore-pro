/**
 * SslController — REST endpoints for SSL certificate management.
 *
 * Endpoints:
 *   POST   /ssl/:domainId/provision  — Provision SSL via Cloudflare (+ LE fallback)
 *   GET    /ssl/:domainId/status     — Get current certificate status
 *   POST   /ssl/:domainId/renew      — Trigger certificate renewal
 *   GET    /ssl/:domainId/details    — Get raw Cloudflare SSL details
 *   GET    /ssl/:domainId/health     — Health check: SSL validity for a domain
 *   PATCH  /ssl/:domainId/mode       — Update Cloudflare SSL mode on a zone
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SslService } from '../services/ssl.service.js';
import { CloudflareSslClient } from '../services/cloudflare-ssl.client.js';
import { ProvisionSslDto, RenewCertificateDto, UpdateSslModeDto } from '../dto/ssl.dto.js';
import type {
  SslProvisionResult,
  CertificateStatus,
  SslRenewalResult,
  CloudflareSslDetails,
} from '../types/ssl.types.js';

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

export interface SslHealthResponse {
  domainId: string;
  hostname: string;
  isValid: boolean;
  status: string;
  provider: string;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('ssl')
export class SslController {
  constructor(
    private readonly sslService: SslService,
    private readonly cfClient: CloudflareSslClient,
  ) {}

  /**
   * POST /ssl/:domainId/provision
   *
   * Provisions SSL for a domain via Cloudflare Universal SSL or ACM.
   * Falls back to Let's Encrypt when Cloudflare SSL is unavailable.
   */
  @Post(':domainId/provision')
  @HttpCode(HttpStatus.CREATED)
  async provision(
    @Param('domainId') domainId: string,
    @Body() dto: ProvisionSslDto,
  ): Promise<SslProvisionResult> {
    return this.sslService.provisionSsl({
      domainId,
      hostname: '', // resolved from the domain record by SslService
      cloudflareZoneId: dto.cloudflareZoneId,
      sslMode: dto.sslMode,
      useAdvancedCertManager: dto.useAdvancedCertManager,
    });
  }

  /**
   * GET /ssl/:domainId/status
   *
   * Returns the current SSL certificate status, refreshing from Cloudflare.
   */
  @Get(':domainId/status')
  async getStatus(
    @Param('domainId') domainId: string,
  ): Promise<CertificateStatus> {
    return this.sslService.checkCertificateStatus(domainId);
  }

  /**
   * POST /ssl/:domainId/renew
   *
   * Triggers certificate renewal (Cloudflare ACM re-order or ACME re-issue).
   */
  @Post(':domainId/renew')
  @HttpCode(HttpStatus.OK)
  async renew(
    @Param('domainId') domainId: string,
    @Body() _dto: RenewCertificateDto,
  ): Promise<SslRenewalResult> {
    return this.sslService.renewCertificate(domainId);
  }

  /**
   * GET /ssl/:domainId/details
   *
   * Returns raw Cloudflare SSL certificate details for the domain.
   */
  @Get(':domainId/details')
  async getDetails(
    @Param('domainId') domainId: string,
  ): Promise<CloudflareSslDetails> {
    return this.sslService.getSslDetails(domainId);
  }

  /**
   * GET /ssl/:domainId/health
   *
   * Health check endpoint returning SSL validity for a domain.
   * Always returns HTTP 200; inspect `isValid` and `status` for the outcome.
   */
  @Get(':domainId/health')
  async health(
    @Param('domainId') domainId: string,
  ): Promise<SslHealthResponse> {
    const status = await this.sslService.checkCertificateStatus(domainId);

    return {
      domainId: status.domainId,
      hostname: status.hostname,
      isValid: status.isValid,
      status: status.status,
      provider: status.provider,
      expiresAt: status.expiresAt,
      daysUntilExpiry: status.daysUntilExpiry,
      isExpiringSoon: status.isExpiringSoon,
      checkedAt: new Date(),
    };
  }

  /**
   * PATCH /ssl/:domainId/mode
   *
   * Updates the Cloudflare SSL/TLS mode on the domain's zone.
   */
  @Patch(':domainId/mode')
  @HttpCode(HttpStatus.OK)
  async updateMode(
    @Param('domainId') _domainId: string,
    @Body() dto: UpdateSslModeDto,
  ): Promise<{ sslMode: string; message: string }> {
    await this.cfClient.setSslMode(dto.cloudflareZoneId, dto.sslMode);
    return {
      sslMode: dto.sslMode,
      message: `SSL mode updated to "${dto.sslMode}" on zone ${dto.cloudflareZoneId}`,
    };
  }
}
