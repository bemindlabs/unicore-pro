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
