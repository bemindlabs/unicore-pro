import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError, throwError } from 'rxjs';
import type { Request } from 'express';
import { AuditService } from './audit.service.js';
import {
  AUDITED_OPTIONS_KEY,
  AUDIT_RESOURCE_KEY,
  AuditedOptions,
  LogActionDto,
} from './types.js';
import { computeDiff, redactSensitive, JsonObject } from './diff.js';

/**
 * AuditInterceptor — NestJS interceptor that auto-logs mutations.
 *
 * Attach globally or per-controller.  It activates only on methods decorated
 * with @Audited() and automatically derives action, resource, IP, user etc.
 * from the request context, so most handlers need zero boilerplate.
 *
 * Registration (global):
 * ```ts
 * app.useGlobalInterceptors(new AuditInterceptor(reflector, auditService));
 * ```
 *
 * Registration (per module via DI):
 * ```ts
 * { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
 * ```
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only handle HTTP contexts
    if (context.getType() !== 'http') {
      return next.handle();
    }

    // Check whether this handler is decorated with @Audited()
    const auditedOptions = this.reflector.getAllAndOverride<AuditedOptions | undefined>(
      AUDITED_OPTIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditedOptions) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request & {
      user?: { id?: string; email?: string };
      auditBefore?: Record<string, unknown>;
    }>();

    const classResource = this.reflector.get<string | undefined>(
      AUDIT_RESOURCE_KEY,
      context.getClass(),
    );

    const resource = auditedOptions.resource ?? classResource ?? inferResource(req);
    const action = auditedOptions.action ?? inferAction(req.method);
    const resourceIdParam = auditedOptions.resourceIdParam ?? 'id';
    const resourceId = (req.params?.[resourceIdParam] as string | undefined) ?? null;

    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] ?? null;
    const httpRoute = `${req.method} ${req.path}`;
    const userId = req.user?.id ?? null;
    const userEmail = req.user?.email ?? null;

    // Capture "before" snapshot if it was populated by the route handler or a guard
    const beforeSnapshot = req.auditBefore
      ? redactSensitive(req.auditBefore)
      : null;

    const startTime = Date.now();

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const afterSnapshot =
          !auditedOptions.skipDiff && responseBody && typeof responseBody === 'object'
            ? redactSensitive(responseBody as JsonObject)
            : null;

        const before = beforeSnapshot;
        const after = afterSnapshot;

        // Only include diff metadata when both snapshots are available
        const diffMeta =
          before && after && !auditedOptions.skipDiff
            ? { diff: computeDiff(before, after) }
            : {};

        const dto: LogActionDto = {
          userId,
          userEmail,
          action,
          resource,
          resourceId,
          before,
          after,
          ip,
          userAgent: typeof userAgent === 'string' ? userAgent : null,
          httpRoute,
          success: true,
          metadata: {
            ...diffMeta,
            ...(auditedOptions.metadata ?? {}),
            durationMs: Date.now() - startTime,
          },
        };

        // Fire-and-forget — audit errors must not affect the response
        this.auditService.log(dto).catch((err: unknown) => {
          this.logger.error('Audit log write failed', err);
        });
      }),
      catchError((err: unknown) => {
        const dto: LogActionDto = {
          userId,
          userEmail,
          action,
          resource,
          resourceId,
          ip,
          userAgent: typeof userAgent === 'string' ? userAgent : null,
          httpRoute,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          metadata: {
            ...(auditedOptions.metadata ?? {}),
            durationMs: Date.now() - startTime,
          },
        };

        this.auditService.log(dto).catch((e: unknown) => {
          this.logger.error('Audit log write failed for error path', e);
        });

        return throwError(() => err);
      }),
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    case 'GET': return 'read';
    default: return method.toLowerCase();
  }
}

function inferResource(req: Request): string {
  // Take the first path segment after the leading slash as the resource name
  // e.g. /api/contacts/123 → "contacts"
  const parts = req.path.replace(/^\/api\//, '/').split('/').filter(Boolean);
  return parts[0] ?? 'unknown';
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() ?? null;
  }
  return (req.socket?.remoteAddress) ?? null;
}
