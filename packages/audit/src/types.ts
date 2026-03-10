// Audit types — aligned with Prisma schema and NestJS patterns

// ─── Core enums / constants ────────────────────────────────────────────────────

export const AuditAction = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  READ: 'read',
  LOGIN: 'login',
  LOGOUT: 'logout',
  EXPORT: 'export',
  IMPORT: 'import',
  INVOKE: 'invoke',
  ASSIGN: 'assign',
  REVOKE: 'revoke',
  APPROVE: 'approve',
  REJECT: 'reject',
} as const;

export type AuditActionValue = typeof AuditAction[keyof typeof AuditAction];

// ─── AuditLog record (mirrors Prisma model) ────────────────────────────────────

export interface AuditLogRecord {
  id: string;
  timestamp: Date;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  httpRoute: string | null;
  metadata: Record<string, unknown> | null;
  success: boolean;
  error: string | null;
}

// ─── Input DTOs ────────────────────────────────────────────────────────────────

/** Minimum required data to create a log entry. */
export interface LogActionDto {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  httpRoute?: string | null;
  metadata?: Record<string, unknown> | null;
  success?: boolean;
  error?: string | null;
}

// ─── Query / filter ────────────────────────────────────────────────────────────

export interface AuditQueryFilters {
  userId?: string;
  userEmail?: string;
  action?: string | string[];
  resource?: string | string[];
  resourceId?: string;
  /** ISO string or Date — inclusive lower bound on timestamp */
  from?: string | Date;
  /** ISO string or Date — inclusive upper bound on timestamp */
  to?: string | Date;
  success?: boolean;
  /** Full-text search across userEmail, resource, resourceId, httpRoute */
  search?: string;
}

export interface AuditQueryOptions {
  filters?: AuditQueryFilters;
  /** 1-based page number (default: 1) */
  page?: number;
  /** Items per page (default: 50, max: 500) */
  limit?: number;
  /** Sort field (default: "timestamp") */
  orderBy?: 'timestamp' | 'action' | 'resource' | 'userId';
  /** Sort direction (default: "desc") */
  orderDir?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  data: AuditLogRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Export ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  filters?: AuditQueryFilters;
  /** Max rows to export (default: 10 000) */
  maxRows?: number;
}

export interface ExportResult {
  format: ExportFormat;
  content: string;
  rowCount: number;
  generatedAt: Date;
}

// ─── Decorator metadata ────────────────────────────────────────────────────────

export interface AuditedOptions {
  /** Override action name (default: derived from HTTP method) */
  action?: string;
  /** Override resource name (default: derived from controller metadata) */
  resource?: string;
  /** Name of the route param that holds the resourceId (default: "id") */
  resourceIdParam?: string;
  /** If true, skip capturing before/after diffs even if entity snapshots are available */
  skipDiff?: boolean;
  /** Extra static metadata to attach to every log entry from this method */
  metadata?: Record<string, unknown>;
}

export const AUDITED_OPTIONS_KEY = 'audit:audited_options';
export const AUDIT_RESOURCE_KEY = 'audit:resource';

// ─── Module options ────────────────────────────────────────────────────────────

export interface AuditModuleOptions {
  /**
   * Inject the Prisma service token. Defaults to 'PrismaService'.
   * Override when your host app registers Prisma under a different token.
   */
  prismaServiceToken?: string | symbol;
  /**
   * Global resource prefix added to every auto-logged entry (optional).
   * Useful for namespacing in multi-tenant setups, e.g. "tenant_42".
   */
  resourcePrefix?: string;
  /**
   * If true, log entries where success=false are still persisted.
   * Default: true.
   */
  logFailures?: boolean;
  /**
   * Maximum number of rows returned by a single query (hard cap).
   * Default: 500.
   */
  maxQueryLimit?: number;
}
