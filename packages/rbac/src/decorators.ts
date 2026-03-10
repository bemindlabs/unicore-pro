import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { RBAC_PERMISSIONS_KEY, RBAC_ROLES_KEY } from './types';
import { RbacGuard } from './rbac.guard';

/**
 * @RequirePermissions('contacts:read', 'orders:write')
 *
 * Declares that the decorated route handler requires ALL listed permissions.
 * Activates RbacGuard automatically.
 */
export function RequirePermissions(...permissions: string[]) {
  return applyDecorators(
    SetMetadata(RBAC_PERMISSIONS_KEY, permissions),
    UseGuards(RbacGuard),
  );
}

/**
 * @RequireRoles('admin', 'manager')
 *
 * Declares that the decorated route handler requires the user to have AT LEAST
 * ONE of the listed roles. Activates RbacGuard automatically.
 */
export function RequireRoles(...roles: string[]) {
  return applyDecorators(
    SetMetadata(RBAC_ROLES_KEY, roles),
    UseGuards(RbacGuard),
  );
}

/**
 * @Public()
 *
 * Marks a route as publicly accessible — RbacGuard will skip authorization.
 */
export const IS_PUBLIC_KEY = 'rbac:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
