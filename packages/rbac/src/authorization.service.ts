import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { RoleService } from './role.service';
import { PermissionService } from './permission.service';
import type { AssignRoleDto, RevokeRoleDto, AuthorizeDto, AuthorizationResult } from './types';
import { DEFAULT_ROLE_HIERARCHY } from './constants';

interface RoleAssignmentRow {
  id: string;
  userId: string;
  roleId: string;
  scopeType: string | null;
  scopeId: string | null;
  assignedBy: string | null;
  assignedAt: Date;
  expiresAt: Date | null;
  role: { id: string; name: string };
}

/**
 * AuthorizationService — role assignment management and permission enforcement.
 *
 * Handles:
 * - Assigning / revoking roles to users
 * - Resolving effective permissions (with hierarchy)
 * - Authorizing user actions
 */
@Injectable()
export class AuthorizationService {
  private readonly roleHierarchy: string[];
  private readonly throwOnUnauthorized: boolean;

  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    @Inject('PRISMA_SERVICE') private readonly prisma: any,
    @Inject('RBAC_OPTIONS')
    private readonly options: {
      roleHierarchy?: string[];
      throwOnUnauthorized?: boolean;
    } = {},
  ) {
    this.roleHierarchy = options.roleHierarchy ?? DEFAULT_ROLE_HIERARCHY;
    this.throwOnUnauthorized = options.throwOnUnauthorized ?? true;
  }

  // ─── Role Assignment ─────────────────────────────────────────────────────────

  async assignRole(dto: AssignRoleDto): Promise<RoleAssignmentRow> {
    const role = await this.roleService.findByName(dto.roleName);
    if (!role) {
      throw new Error(`Role '${dto.roleName}' not found`);
    }

    return this.prisma.roleAssignment.upsert({
      where: {
        userId_roleId_scopeType_scopeId: {
          userId: dto.userId,
          roleId: role.id,
          scopeType: dto.scopeType ?? null,
          scopeId: dto.scopeId ?? null,
        },
      },
      create: {
        userId: dto.userId,
        roleId: role.id,
        scopeType: dto.scopeType ?? null,
        scopeId: dto.scopeId ?? null,
        assignedBy: dto.assignedBy ?? null,
        expiresAt: dto.expiresAt ?? null,
      },
      update: {
        assignedBy: dto.assignedBy ?? null,
        expiresAt: dto.expiresAt ?? null,
      },
      include: { role: { select: { id: true, name: true } } },
    });
  }

  async revokeRole(dto: RevokeRoleDto): Promise<void> {
    const role = await this.roleService.findByName(dto.roleName);
    if (!role) {
      throw new Error(`Role '${dto.roleName}' not found`);
    }

    await this.prisma.roleAssignment.deleteMany({
      where: {
        userId: dto.userId,
        roleId: role.id,
        scopeType: dto.scopeType ?? null,
        scopeId: dto.scopeId ?? null,
      },
    });
  }

  async getUserRoles(
    userId: string,
    scopeType?: string,
    scopeId?: string,
  ): Promise<RoleAssignmentRow[]> {
    const now = new Date();

    return this.prisma.roleAssignment.findMany({
      where: {
        userId,
        ...(scopeType !== undefined && { scopeType }),
        ...(scopeId !== undefined && { scopeId }),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { role: { select: { id: true, name: true } } },
    });
  }

  // ─── Authorization ───────────────────────────────────────────────────────────

  async authorize(dto: AuthorizeDto): Promise<AuthorizationResult> {
    const assignments = await this.getUserRoles(dto.userId, dto.scopeType, dto.scopeId);

    // Also include global-scope assignments if a scope is specified
    let allAssignments = assignments;
    if (dto.scopeType || dto.scopeId) {
      const globalAssignments = await this.getUserRoles(dto.userId);
      const ids = new Set(assignments.map((a) => a.id));
      allAssignments = [
        ...assignments,
        ...globalAssignments.filter((a) => !ids.has(a.id)),
      ];
    }

    const directRoles = allAssignments.map((a) => a.role.name);

    // Expand roles through hierarchy
    const effectiveRoles = this.expandRoleHierarchy(directRoles);

    // Collect role IDs for effective roles
    const effectiveRoleNames = [...new Set([...directRoles, ...effectiveRoles])];
    const roleIds = allAssignments
      .filter((a) => effectiveRoleNames.includes(a.role.name))
      .map((a) => a.roleId);

    // Also fetch IDs for hierarchy-added roles
    const hierarchyRoles = effectiveRoles.filter((r) => !directRoles.includes(r));
    if (hierarchyRoles.length > 0) {
      const dbRoles = await this.prisma.role.findMany({
        where: { name: { in: hierarchyRoles } },
        select: { id: true },
      });
      roleIds.push(...dbRoles.map((r: { id: string }) => r.id));
    }

    const grantedPermissions = await this.permissionService.getPermissionsForRoles([
      ...new Set(roleIds),
    ]);

    const authorized = this.permissionService.hasPermission(
      grantedPermissions,
      dto.permission,
    );

    const result: AuthorizationResult = {
      authorized,
      userId: dto.userId,
      permission: dto.permission,
      roles: directRoles,
      reason: authorized ? undefined : `User lacks permission '${dto.permission}'`,
    };

    if (!authorized && this.throwOnUnauthorized) {
      throw new ForbiddenException(result.reason);
    }

    return result;
  }

  async can(userId: string, permission: string): Promise<boolean> {
    const result = await this.authorize({ userId, permission, });
    return result.authorized;
  }

  async canInScope(
    userId: string,
    permission: string,
    scopeType: string,
    scopeId: string,
  ): Promise<boolean> {
    const result = await this.authorize({ userId, permission, scopeType, scopeId });
    return result.authorized;
  }

  /**
   * Returns all effective permission names for a user, expanding the role hierarchy.
   */
  async getUserPermissions(userId: string, scopeType?: string, scopeId?: string): Promise<string[]> {
    const assignments = await this.getUserRoles(userId, scopeType, scopeId);
    const directRoles = assignments.map((a) => a.role.name);
    const hierarchyRoles = this.expandRoleHierarchy(directRoles);

    const allRoleNames = [...new Set([...directRoles, ...hierarchyRoles])];
    const directRoleIds = assignments.map((a) => a.roleId);

    const hierarchyRoleObjs = await this.prisma.role.findMany({
      where: { name: { in: hierarchyRoles } },
      select: { id: true },
    });
    const hierarchyRoleIds = hierarchyRoleObjs.map((r: { id: string }) => r.id);

    const allRoleIds = [...new Set([...directRoleIds, ...hierarchyRoleIds])];
    return this.permissionService.getPermissionsForRoles(allRoleIds);
  }

  // ─── Role Hierarchy ──────────────────────────────────────────────────────────

  /**
   * Given a set of role names, returns all roles that are implied through the
   * hierarchy (i.e., roles with lower privilege that are inherited).
   */
  private expandRoleHierarchy(roleNames: string[]): string[] {
    const inherited: string[] = [];

    for (const roleName of roleNames) {
      const idx = this.roleHierarchy.indexOf(roleName);
      if (idx === -1) continue; // unknown / custom role — no hierarchy expansion

      // All roles below this one in the hierarchy are inherited
      const below = this.roleHierarchy.slice(0, idx);
      inherited.push(...below);
    }

    return [...new Set(inherited)].filter((r) => !roleNames.includes(r));
  }

  /**
   * Returns the highest-privilege role from a list based on the configured hierarchy.
   * Returns null if no roles match the hierarchy.
   */
  getHighestRole(roleNames: string[]): string | null {
    for (let i = this.roleHierarchy.length - 1; i >= 0; i--) {
      if (roleNames.includes(this.roleHierarchy[i])) {
        return this.roleHierarchy[i];
      }
    }
    return roleNames[0] ?? null;
  }
}
