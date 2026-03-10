/**
 * @unicore/domains — Data Transfer Objects
 *
 * Plain-class DTOs for use with class-validator / class-transformer if desired.
 * Intentionally free of decorators so consumers can apply their own validation.
 */

import type { DomainStatus, SslStatus } from '../types/domains.types.js';

// ─── Request DTOs ─────────────────────────────────────────────────────────────

/**
 * Input for registering a new custom domain.
 */
export class AddDomainDto {
  /** Fully-qualified domain name (apex or subdomain). e.g. "app.acme.com". */
  domain!: string;
  /** Tenant / organization ID that will own this domain. */
  tenantId!: string;
}

/**
 * Query parameters for listing domains belonging to a tenant.
 */
export class ListDomainsQueryDto {
  /** Filter by tenant ID. */
  tenantId!: string;
  /** Optional status filter. */
  status?: DomainStatus;
  /** Maximum number of results (default: 50). */
  limit?: number;
  /** Zero-based offset for pagination (default: 0). */
  offset?: number;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Full domain record returned by the API.
 */
export class DomainResponseDto {
  id!: string;
  domain!: string;
  tenantId!: string;
  status!: DomainStatus;
  verifiedAt!: Date | null;
  sslStatus!: SslStatus;
  /**
   * The TXT record value the customer must publish to prove ownership.
   * Example value: `unicore-verify=<hex-token>`
   */
  txtVerificationRecord!: string;
  /**
   * The full DNS name where the TXT record must be placed.
   * Example: `_unicore-verify.app.acme.com`
   */
  txtRecordName!: string;
  cloudflareZoneId!: string | null;
  cloudflareDnsRecordId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Result returned after a DNS configuration (CNAME creation) call.
 */
export class ConfigureDnsResponseDto {
  domain!: string;
  cnameTarget!: string;
  cloudflareZoneId!: string;
  cloudflareDnsRecordId!: string;
  proxied!: boolean;
}

/**
 * Result returned after a domain ownership verification attempt.
 */
export class VerifyOwnershipResponseDto {
  verified!: boolean;
  domain!: string;
  expectedRecord!: string;
  foundRecord?: string;
  message!: string;
}
