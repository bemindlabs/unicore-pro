/**
 * SSL certificate type definitions for @unicore/domains.
 *
 * Covers Cloudflare SSL/TLS configuration, certificate lifecycle,
 * Let's Encrypt ACME fallback, and health-check output.
 */

// ---------------------------------------------------------------------------
// Primitive union types (mirror Prisma enums for application code)
// ---------------------------------------------------------------------------

export type SslStatus = 'pending' | 'active' | 'expiring' | 'expired' | 'error';

export type SslProvider = 'cloudflare' | 'letsencrypt';

/**
 * Cloudflare SSL/TLS mode.
 * @see https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
 */
export type SslMode = 'off' | 'flexible' | 'full' | 'strict';

// ---------------------------------------------------------------------------
// Core certificate record (maps to SslCertificate Prisma model)
// ---------------------------------------------------------------------------

export interface SslCertificate {
  id: string;
  domainId: string;
  provider: SslProvider;
  status: SslStatus;
  sslMode: SslMode;
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
// Module configuration
// ---------------------------------------------------------------------------

export interface SslModuleOptions {
  /** Cloudflare API token with SSL and Certificates:Edit permission. */
  cloudflareApiToken: string;
  /** Cloudflare Account ID (for custom hostname creation). */
  cloudflareAccountId?: string;
  /** Default SSL mode when provisioning. Defaults to "full". */
  defaultSslMode?: SslMode;
  /** Days before expiry to emit SslExpiryWarning. Defaults to 30. */
  expiryWarningDays?: number;
  /** Monitor polling interval in ms. Defaults to 3 600 000 (1 hour). */
  monitorIntervalMs?: number;
  /** ACME directory URL (Let's Encrypt fallback). Defaults to production. */
  acmeDirectoryUrl?: string;
  /** Contact email for ACME account registration. */
  acmeContactEmail?: string;
}

/** Per-domain SSL configuration snapshot. */
export interface SslConfig {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  sslMode: SslMode;
  cloudflareZoneId?: string;
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

export interface ProvisionSslOptions {
  domainId: string;
  hostname: string;
  cloudflareZoneId: string;
  sslMode?: SslMode;
  /** Attempt Cloudflare Advanced Certificate Manager. Defaults to false. */
  useAdvancedCertManager?: boolean;
}

export interface SslProvisionResult {
  certificate: SslCertificate;
  provider: SslProvider;
  isNew: boolean;
  cloudflareActivated: boolean;
  letsEncryptFallback: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Status / health check
// ---------------------------------------------------------------------------

export interface CertificateStatus {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  status: SslStatus;
  sslMode: SslMode;
  issuedAt: Date | null;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  lastCheckedAt: Date | null;
  isValid: boolean;
  isExpiringSoon: boolean;
  cloudflareDetails?: CloudflareSslDetails;
  message?: string;
}

export interface CloudflareSslDetails {
  certPackId?: string;
  type?: string;
  hosts?: string[];
  primaryCertificate?: {
    id: string;
    type: string;
    hosts: string[];
    issuer: string;
    signature: string;
    status: string;
    bundleMethod: string;
    validFrom: string;
    validTo: string;
  };
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

export interface SslRenewalResult {
  domainId: string;
  success: boolean;
  provider: SslProvider;
  newExpiresAt: Date | null;
  message: string;
}

// ---------------------------------------------------------------------------
// ACME / Let's Encrypt interface
// ---------------------------------------------------------------------------

/** Minimal ACME client interface for Let's Encrypt fallback. */
export interface AcmeClient {
  createAccount(email: string): Promise<{ accountUrl: string }>;
  createOrder(hostname: string): Promise<AcmeOrder>;
  getChallenge(order: AcmeOrder, type: 'http-01' | 'dns-01'): Promise<AcmeChallenge>;
  completeChallenge(challenge: AcmeChallenge): Promise<void>;
  waitForValid(order: AcmeOrder, timeoutMs?: number): Promise<void>;
  finalize(order: AcmeOrder): Promise<string>;
}

export interface AcmeOrder {
  url: string;
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  hostname: string;
}

export interface AcmeChallenge {
  type: 'http-01' | 'dns-01';
  token: string;
  keyAuthorization: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface SslProvisionedEvent {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  certId: string;
}

export interface SslExpiryWarningEvent {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  expiresAt: Date;
  daysUntilExpiry: number;
}

export interface SslExpiredEvent {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  expiredAt: Date;
}

export interface SslRenewedEvent {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  newExpiresAt: Date | null;
}

export interface SslErrorEvent {
  domainId: string;
  hostname: string;
  error: string;
}
