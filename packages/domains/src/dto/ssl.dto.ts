/**
 * SSL DTOs for @unicore/domains REST endpoints.
 */

import type { SslMode } from '../types/ssl.types.js';

export class ProvisionSslDto {
  cloudflareZoneId!: string;
  sslMode?: SslMode;
  useAdvancedCertManager?: boolean;
}

export class RenewCertificateDto {
  reason?: string;
}

export class UpdateSslModeDto {
  sslMode!: SslMode;
  cloudflareZoneId!: string;
}
