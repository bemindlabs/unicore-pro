/**
 * Injection tokens and defaults for @unicore/domains SSL provisioning.
 */

export const SSL_MODULE_OPTIONS = 'SSL_MODULE_OPTIONS' as const;
export const SSL_PRISMA_CLIENT = 'SSL_PRISMA_CLIENT' as const;
export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4' as const;
export const LETS_ENCRYPT_ACME_DIRECTORY = 'https://acme-v02.api.letsencrypt.org/directory' as const;
export const DEFAULT_EXPIRY_WARNING_DAYS = 30 as const;
export const DEFAULT_MONITOR_INTERVAL_MS = 3_600_000 as const;
