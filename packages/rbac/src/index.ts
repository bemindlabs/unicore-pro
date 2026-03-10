// ─── Module ───────────────────────────────────────────────────────────────────
export { RbacModule } from './rbac.module';

// ─── Services ─────────────────────────────────────────────────────────────────
export { RoleService } from './role.service';
export { PermissionService } from './permission.service';
export { AuthorizationService } from './authorization.service';

// ─── Guard & Decorators ───────────────────────────────────────────────────────
export { RbacGuard } from './rbac.guard';
export { RequirePermissions, RequireRoles, Public } from './decorators';
export { IS_PUBLIC_KEY } from './decorators';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
export { bootstrapRbacStep2 } from './bootstrap';
export { seedRbac } from './seed';

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  DEFAULT_ROLES,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_HIERARCHY,
} from './constants';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  RoleSlug,
  ResourceName,
  ActionName,
  PermissionString,
  CreateRoleDto,
  UpdateRoleDto,
  CreatePermissionDto,
  UpdatePermissionDto,
  AssignRoleDto,
  RevokeRoleDto,
  AuthorizeDto,
  AuthorizationResult,
  RoleWithPermissions,
  RbacModuleOptions,
} from './types';

export { RBAC_PERMISSIONS_KEY, RBAC_ROLES_KEY } from './types';

export type { Permission } from './permission.service';
export type { TeamMemberInput, BootstrapStep2Result } from './bootstrap';
