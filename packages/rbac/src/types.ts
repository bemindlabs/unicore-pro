// RBAC types — aligned with Prisma schema and NestJS patterns

export type RoleSlug =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'member'
  | 'viewer';

export type ResourceName =
  | 'contacts'
  | 'orders'
  | 'inventory'
  | 'invoicing'
  | 'expenses'
  | 'reports'
  | 'agents'
  | 'workflows'
  | 'channels'
  | 'users'
  | 'roles'
  | 'settings'
  | 'audit'
  | 'billing';

export type ActionName =
  | 'read'
  | 'write'
  | 'delete'
  | 'invoke'
  | 'manage'
  | '*';

export type PermissionString = `${ResourceName}:${ActionName}`;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateRoleDto {
  name: string;
  displayName: string;
  description?: string;
  isSystem?: boolean;
  sortOrder?: number;
  permissionNames?: string[];
}

export interface UpdateRoleDto {
  displayName?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  permissionNames?: string[];
}

export interface CreatePermissionDto {
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface UpdatePermissionDto {
  description?: string;
  isActive?: boolean;
}

export interface AssignRoleDto {
  userId: string;
  roleName: RoleSlug | string;
  scopeType?: string;
  scopeId?: string;
  assignedBy?: string;
  expiresAt?: Date;
}

export interface RevokeRoleDto {
  userId: string;
  roleName: string;
  scopeType?: string;
  scopeId?: string;
}

export interface AuthorizeDto {
  userId: string;
  permission: PermissionString | string;
  scopeType?: string;
  scopeId?: string;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RoleWithPermissions {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  permissions: Array<{
    id: string;
    name: string;
    resource: string;
    action: string;
    description: string | null;
  }>;
}

export interface AuthorizationResult {
  authorized: boolean;
  userId: string;
  permission: string;
  roles: string[];
  reason?: string;
}

// ─── Module options ────────────────────────────────────────────────────────────

export interface RbacModuleOptions {
  /**
   * Inject the Prisma service token. Defaults to 'PrismaService'.
   * Set to your custom Prisma service token if it differs.
   */
  prismaServiceToken?: string | symbol;
  /**
   * If true, throws ForbiddenException when authorization fails.
   * If false, returns AuthorizationResult with authorized=false.
   * Default: true
   */
  throwOnUnauthorized?: boolean;
  /**
   * Role hierarchy: roles inherit permissions from roles lower in the list.
   * Index 0 = lowest privilege, last index = highest.
   */
  roleHierarchy?: string[];
}

// ─── Guard metadata keys ──────────────────────────────────────────────────────

export const RBAC_PERMISSIONS_KEY = 'rbac:permissions';
export const RBAC_ROLES_KEY = 'rbac:roles';
