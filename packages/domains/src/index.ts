/**
 * @unicore/domains — Public API
 *
 * Domain mapping service with Cloudflare DNS integration for UniCore Pro.
 * Supports custom domain registration, TXT-record ownership verification,
 * CNAME configuration via Cloudflare, and apex / subdomain mapping.
 */

// Module
export { DomainsModule } from './domains.module.js';
export type { DomainsModuleAsyncOptions } from './domains.module.js';

// Services
export { DomainService } from './services/domain.service.js';
export { CloudflareClient } from './services/cloudflare.client.js';

// DTOs
export {
  AddDomainDto,
  ListDomainsQueryDto,
  DomainResponseDto,
  ConfigureDnsResponseDto,
  VerifyOwnershipResponseDto,
} from './dto/domains.dto.js';

// Types
export type {
  DomainStatus,
  SslStatus,
  CloudflareConfig,
  CloudflareDnsRecordType,
  CloudflareDnsRecord,
  CloudflareZone,
  CreateDnsRecordInput,
  UpdateDnsRecordInput,
  Domain,
  AddDomainDto as AddDomainInput,
  DomainResponseDto as DomainResponse,
  ListDomainsOptions,
  ConfigureDnsResult,
  VerifyOwnershipResult,
  DomainsModuleOptions,
} from './types/domains.types.js';

// Constants
export {
  DOMAINS_MODULE_OPTIONS,
  DOMAINS_PRISMA_SERVICE,
  DEFAULT_TXT_RECORD_PREFIX,
} from './domains.constants.js';

// ---------------------------------------------------------------------------
// SSL provisioning (UNC-52)
// ---------------------------------------------------------------------------

export { SslModule } from './ssl.module.js';
export type { SslModuleAsyncOptions } from './ssl.module.js';

export { SslService, SSL_PRISMA } from './services/ssl.service.js';
export { SslMonitorService } from './services/ssl-monitor.service.js';
export { CloudflareSslClient } from './services/cloudflare-ssl.client.js';

export { SslController } from './controllers/ssl.controller.js';
export type { SslHealthResponse } from './controllers/ssl.controller.js';

export { ProvisionSslDto, RenewCertificateDto, UpdateSslModeDto } from './dto/ssl.dto.js';

export type {
  SslCertificate,
  SslModuleOptions,
  SslConfig,
  ProvisionSslOptions,
  SslProvisionResult,
  CertificateStatus,
  CloudflareSslDetails,
  SslRenewalResult,
  AcmeClient,
  AcmeOrder,
  AcmeChallenge,
  SslProvisionedEvent,
  SslExpiryWarningEvent,
  SslExpiredEvent,
  SslRenewedEvent,
  SslErrorEvent,
} from './types/ssl.types.js';

export { SSL_EVENTS } from './events/ssl.events.js';
export type { SslEventName } from './events/ssl.events.js';

export {
  SSL_MODULE_OPTIONS,
  SSL_PRISMA_CLIENT,
  CLOUDFLARE_API_BASE,
  LETS_ENCRYPT_ACME_DIRECTORY,
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_MONITOR_INTERVAL_MS,
} from './ssl.constants.js';
