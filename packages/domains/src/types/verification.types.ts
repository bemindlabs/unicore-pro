// @unicore/domains — Verification sub-system type definitions
// TypeScript 5.5+, ES2022, strict mode

// ─── Verification status ─────────────────────────────────────────────────────

export const VerificationStatus = {
  /** Initial state — TXT record generated, waiting for user to add it to DNS */
  PENDING: 'pending',
  /** Polling is in progress — DNS checks are being made */
  VERIFYING: 'verifying',
  /** DNS TXT record was found and matched — waiting for activation */
  VERIFIED: 'verified',
  /** Domain is live and active */
  ACTIVE: 'active',
  /** Max retries exceeded */
  FAILED: 'failed',
  /** Verification was cancelled by user */
  CANCELLED: 'cancelled',
} as const;

export type VerificationStatusValue = (typeof VerificationStatus)[keyof typeof VerificationStatus];

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Valid state transitions:
 *   pending    -> verifying | cancelled
 *   verifying  -> verified | failed | cancelled
 *   verified   -> active | failed
 *   failed     -> pending  (can restart)
 *   cancelled  -> pending  (can restart)
 *   active     -> (terminal)
 */
export const VALID_TRANSITIONS: Readonly<
  Record<VerificationStatusValue, readonly VerificationStatusValue[]>
> = {
  [VerificationStatus.PENDING]: [VerificationStatus.VERIFYING, VerificationStatus.CANCELLED],
  [VerificationStatus.VERIFYING]: [
    VerificationStatus.VERIFIED,
    VerificationStatus.FAILED,
    VerificationStatus.CANCELLED,
  ],
  [VerificationStatus.VERIFIED]: [VerificationStatus.ACTIVE, VerificationStatus.FAILED],
  [VerificationStatus.ACTIVE]: [],
  [VerificationStatus.FAILED]: [VerificationStatus.PENDING],
  [VerificationStatus.CANCELLED]: [VerificationStatus.PENDING],
};

// ─── Database model type ──────────────────────────────────────────────────────

/** A domain verification record as stored in the database. */
export interface VerificationRecord {
  id: string;
  /** FK to the Domain record */
  domainId: string;
  /** The domain name being verified, e.g. "example.com" */
  domain: string;
  /** Full TXT record value the user must publish, e.g. "unicore-verify=<uuid>" */
  txtRecord: string;
  status: VerificationStatusValue;
  /** Number of DNS polling attempts made so far */
  attempts: number;
  /** Maximum allowed polling attempts before transitioning to FAILED */
  maxAttempts: number;
  /** Timestamp of the last DNS check */
  lastCheckedAt: Date | null;
  /** Timestamp when the domain was successfully verified */
  verifiedAt: Date | null;
  /** Timestamp when the domain became active */
  activatedAt: Date | null;
  /**
   * End of the current rate-limit window.
   * New verification starts are blocked while now < rateLimitResetAt
   * AND startCount >= maxStartsPerHour.
   */
  rateLimitResetAt: Date | null;
  /** Number of verification starts in the current rate-limit window */
  startCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DNS result ───────────────────────────────────────────────────────────────

/** Result of a single DNS TXT record check. */
export interface VerificationResult {
  /** Whether any TXT records were found on the domain */
  found: boolean;
  /** All TXT record strings returned by DNS */
  txtRecordsFound: string[];
  /** The specific record value we searched for */
  expectedRecord: string;
  /** Whether the expected record was found */
  matched: boolean;
  checkedAt: Date;
  /** DNS error message, if any */
  error?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface VerificationConfig {
  /**
   * DNS polling interval (ms).
   * Default: 30_000 (30 s)
   */
  pollIntervalMs: number;

  /**
   * Maximum polling attempts before marking verification as failed.
   * Default: 60 (~30 min at 30s intervals)
   */
  maxAttempts: number;

  /**
   * Enable exponential back-off between attempts.
   * Interval doubles each attempt up to maxPollIntervalMs.
   * Default: false
   */
  exponentialBackoff: boolean;

  /**
   * Cap for exponential back-off (ms).
   * Default: 300_000 (5 min)
   */
  maxPollIntervalMs: number;

  /**
   * Maximum verification starts per domain per hour (rate limiting).
   * Default: 5
   */
  maxStartsPerHour: number;

  /**
   * Prefix for generated TXT record values.
   * Default: "unicore-verify"
   */
  txtRecordPrefix: string;
}

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  pollIntervalMs: 30_000,
  maxAttempts: 60,
  exponentialBackoff: false,
  maxPollIntervalMs: 300_000,
  maxStartsPerHour: 5,
  txtRecordPrefix: 'unicore-verify',
};

// ─── Events ───────────────────────────────────────────────────────────────────

export interface DomainVerifiedEvent {
  domainId: string;
  domain: string;
  txtRecord: string;
  verifiedAt: Date;
}

export interface DomainVerificationFailedEvent {
  domainId: string;
  domain: string;
  txtRecord: string;
  attempts: number;
  failedAt: Date;
}

export const DOMAIN_VERIFICATION_EVENTS = {
  VERIFIED: 'domain.verified',
  VERIFICATION_FAILED: 'domain.verification_failed',
} as const;

// ─── Errors ───────────────────────────────────────────────────────────────────

export type VerificationErrorCode =
  | 'RATE_LIMITED'
  | 'INVALID_TRANSITION'
  | 'NOT_FOUND'
  | 'DNS_ERROR'
  | 'ALREADY_ACTIVE'
  | 'ALREADY_VERIFIED';

export class VerificationError extends Error {
  constructor(
    message: string,
    public readonly code: VerificationErrorCode,
    public readonly domainId?: string,
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}
