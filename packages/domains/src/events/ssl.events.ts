/**
 * SSL event name constants for @unicore/domains.
 */

export const SSL_EVENTS = {
  PROVISIONED: 'ssl.provisioned',
  EXPIRY_WARNING: 'ssl.expiry.warning',
  EXPIRED: 'ssl.expired',
  RENEWED: 'ssl.renewed',
  ERROR: 'ssl.error',
} as const;

export type SslEventName = (typeof SSL_EVENTS)[keyof typeof SSL_EVENTS];
