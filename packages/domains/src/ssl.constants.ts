/**
 * Injection tokens and defaults for @unicore/domains SSL provisioning.
 */

export const SSL_MODULE_OPTIONS = 'SSL_MODULE_OPTIONS' as const;
export const SSL_PRISMA_CLIENT = 'SSL_PRISMA_CLIENT' as const;

/** Cloudflare REST API base URL. */
export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4' as const;

/** Let's Encrypt ACME v2 production directory URL. */
export const LETS_ENCRYPT_ACME_DIRECTORY =
  'https://acme-v02.api.letsencrypt.org/directory' as const;

/** Days before cert expiry to emit SslExpiryWarning (default: 30). */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30 as const;

/** Default monitor polling interval in ms: 1 hour. */
export const DEFAULT_MONITOR_INTERVAL_MS = 3_600_000 as const;
