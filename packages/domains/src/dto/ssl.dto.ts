/**
 * SSL DTOs for @unicore/domains REST endpoints.
 */

import type { SslMode } from '../types/ssl.types.js';

/** Body for POST /ssl/:domainId/provision */
export class ProvisionSslDto {
  /** Cloudflare Zone ID for the domain. */
  cloudflareZoneId!: string;
  /** SSL/TLS mode to configure on the zone. @default "full" */
  sslMode?: SslMode;
  /** When true, attempt Cloudflare Advanced Certificate Manager. @default false */
  useAdvancedCertManager?: boolean;
}

/** Body for POST /ssl/:domainId/renew */
export class RenewCertificateDto {
  /** Optional audit reason for the renewal. */
  reason?: string;
}

/** Body for PATCH /ssl/:domainId/mode */
export class UpdateSslModeDto {
  /** New SSL mode to apply on the Cloudflare zone. */
  sslMode!: SslMode;
  /** Cloudflare Zone ID for the domain. */
  cloudflareZoneId!: string;
}
