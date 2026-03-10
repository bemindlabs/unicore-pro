import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { RBAC_PERMISSIONS_KEY, RBAC_ROLES_KEY } from './types';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * RbacGuard — NestJS guard that enforces @RequirePermissions and @RequireRoles.
 *
 * Expects `request.user` to have a `{ id: string }` shape (set by your auth guard).
 * If the route is marked @Public(), the guard passes through without checks.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public() shortcut
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: { id: string; roles?: string[] } }>();
    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('No authenticated user found on request');
    }

    // ── Permission check ──────────────────────────────────────────────────────
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(RBAC_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermissions?.length) {
      for (const permission of requiredPermissions) {
        const result = await this.authorizationService.authorize({
          userId: user.id,
          permission,
        });
        if (!result.authorized) {
          throw new ForbiddenException(`Missing permission: ${permission}`);
        }
      }
    }

    // ── Role check ────────────────────────────────────────────────────────────
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(RBAC_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      const assignments = await this.authorizationService.getUserRoles(user.id);
      const userRoles = assignments.map((a) => a.role.name);
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));

      if (!hasRole) {
        throw new ForbiddenException(
          `Requires one of roles: ${requiredRoles.join(', ')}`,
        );
      }
    }

    return true;
  }
}
