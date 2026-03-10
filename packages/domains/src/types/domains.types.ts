/**
 * @unicore/domains — Type definitions
 *
 * Shared types, DTOs, and configuration interfaces for the domain mapping service.
 */

// ─── Enums (mirror Prisma enums for consumer use without Prisma dependency) ───

export type DomainStatus = 'pending' | 'verifying' | 'verified' | 'active' | 'error';
export type SslStatus = 'pending' | 'active' | 'error';

// ─── Cloudflare types ─────────────────────────────────────────────────────────

/** Configuration required to authenticate with the Cloudflare API. */
export interface CloudflareConfig {
  /** Cloudflare API token with DNS edit permissions. */
  apiToken: string;
  /** Optional account ID — needed for account-level operations. */
  accountId?: string;
  /** Base URL — defaults to 'https://api.cloudflare.com/client/v4'. */
  baseUrl?: string;
  /**
   * The platform's CNAME target that custom domains should point to.
   * e.g. "platform.unicore.io"
   */
  platformHostname: string;
}

export type CloudflareDnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';

export interface CloudflareDnsRecord {
  id: string;
  type: CloudflareDnsRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  zoneId: string;
  zoneName: string;
  createdOn: string;
  modifiedOn: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  nameServers: string[];
}

export interface CreateDnsRecordInput {
  zoneId: string;
  type: CloudflareDnsRecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  comment?: string;
}

export interface UpdateDnsRecordInput {
  zoneId: string;
  recordId: string;
  type: CloudflareDnsRecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  comment?: string;
}

// ─── Domain model types ───────────────────────────────────────────────────────

export interface Domain {
  id: string;
  domain: string;
  tenantId: string;
  status: DomainStatus;
  verifiedAt: Date | null;
  sslStatus: SslStatus;
  txtVerificationRecord: string;
  cloudflareZoneId: string | null;
  cloudflareDnsRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface AddDomainDto {
  /** The fully-qualified domain name to add (apex or subdomain). */
  domain: string;
  /** The tenant/organization ID that owns this domain. */
  tenantId: string;
}

export interface DomainResponseDto {
  id: string;
  domain: string;
  tenantId: string;
  status: DomainStatus;
  verifiedAt: Date | null;
  sslStatus: SslStatus;
  /**
   * The TXT record value the customer must add to prove domain ownership.
   * Should be added as: _unicore-verify.<domain> IN TXT "<txtVerificationRecord>"
   */
  txtVerificationRecord: string;
  /**
   * The full TXT record name the customer must create.
   * e.g. "_unicore-verify.app.acme.com"
   */
  txtRecordName: string;
  cloudflareZoneId: string | null;
  cloudflareDnsRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDomainsOptions {
  tenantId: string;
  status?: DomainStatus;
  limit?: number;
  offset?: number;
}

export interface ConfigureDnsResult {
  domain: string;
  cnameTarget: string;
  cloudflareZoneId: string;
  cloudflareDnsRecordId: string;
  proxied: boolean;
}

export interface VerifyOwnershipResult {
  verified: boolean;
  domain: string;
  expectedRecord: string;
  foundRecord?: string;
  message: string;
}

// ─── Module options ───────────────────────────────────────────────────────────

export interface DomainsModuleOptions {
  /**
   * Cloudflare API configuration. Required for DNS operations.
   */
  cloudflare: CloudflareConfig;
  /**
   * Inject the Prisma service token. Defaults to 'PrismaService'.
   */
  prismaServiceToken?: string | symbol;
  /**
   * TXT record prefix for domain ownership verification.
   * Default: '_unicore-verify'
   */
  txtRecordPrefix?: string;
}
