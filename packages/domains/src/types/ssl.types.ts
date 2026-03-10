/**
 * SSL certificate type definitions for @unicore/domains.
 */

export type SslStatus = 'pending' | 'active' | 'expiring' | 'expired' | 'error';
export type SslProvider = 'cloudflare' | 'letsencrypt';
export type SslMode = 'off' | 'flexible' | 'full' | 'strict';

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

export interface SslModuleOptions {
  cloudflareApiToken: string;
  cloudflareAccountId?: string;
  defaultSslMode?: SslMode;
  expiryWarningDays?: number;
  monitorIntervalMs?: number;
  acmeDirectoryUrl?: string;
  acmeContactEmail?: string;
}

export interface SslConfig {
  domainId: string;
  hostname: string;
  provider: SslProvider;
  sslMode: SslMode;
  cloudflareZoneId?: string;
}

export interface ProvisionSslOptions {
  domainId: string;
  hostname: string;
  cloudflareZoneId: string;
  sslMode?: SslMode;
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

export interface SslRenewalResult {
  domainId: string;
  success: boolean;
  provider: SslProvider;
  newExpiresAt: Date | null;
  message: string;
}

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

export interface SslProvisionedEvent { domainId: string; hostname: string; provider: SslProvider; certId: string; }
export interface SslExpiryWarningEvent { domainId: string; hostname: string; provider: SslProvider; expiresAt: Date; daysUntilExpiry: number; }
export interface SslExpiredEvent { domainId: string; hostname: string; provider: SslProvider; expiredAt: Date; }
export interface SslRenewedEvent { domainId: string; hostname: string; provider: SslProvider; newExpiresAt: Date | null; }
export interface SslErrorEvent { domainId: string; hostname: string; error: string; }
