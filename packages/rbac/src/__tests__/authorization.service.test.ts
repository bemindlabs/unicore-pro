import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthorizationService } from '../authorization.service';
import { RoleService } from '../role.service';
import { PermissionService } from '../permission.service';

// ─── In-memory store ─────────────────────────────────────────────────────────

function makeStore() {
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const rolePermissions: Array<{ roleId: string; permissionId: string }> = [];
  const assignments: Array<{
    id: string;
    userId: string;
    roleId: string;
    scopeType: string | null;
    scopeId: string | null;
    assignedBy: string | null;
    assignedAt: Date;
    expiresAt: Date | null;
  }> = [];

  let idCounter = 1;
  const nextId = () => String(idCounter++);

  function mapRole(role: any) {
    const perms = rolePermissions
      .filter((rp) => rp.roleId === role.id)
      .map((rp) => ({ permission: permissions.get(rp.permissionId) }))
      .filter((rp) => rp.permission);
    return { ...role, permissions: perms };
  }

  function mapAssignment(a: any) {
    const role = roles.get(a.roleId);
    return { ...a, role: role ? { id: role.id, name: role.name } : { id: a.roleId, name: '?' } };
  }

  function parseUniqueKey(where: any) {
    // where.userId_roleId_scopeType_scopeId
    return where.userId_roleId_scopeType_scopeId ?? null;
  }

  const prisma = {
    role: {
      async findUnique({ where }: any) {
        if (where.name) return [...roles.values()].find((r) => r.name === where.name) ?? null;
        if (where.id) return roles.get(where.id) ?? null;
        return null;
      },
      async findMany({ where }: any) {
        let all = [...roles.values()];
        if (where?.name?.in) {
          all = all.filter((r) => (where.name.in as string[]).includes(r.name));
        }
        return all.map(mapRole);
      },
      async create({ data, include }: any) {
        const id = nextId();
        const record = { id, name: data.name, displayName: data.displayName, isSystem: false, isActive: true, sortOrder: 0, permissions: [] };
        roles.set(id, record);
        if (data.permissions?.create) {
          for (const { permissionId } of data.permissions.create) rolePermissions.push({ roleId: id, permissionId });
        }
        return mapRole(record);
      },
      async update({ where, data, include }: any) {
        const role = roles.get(where.id);
        if (!role) throw new Error('not found');
        Object.assign(role, data);
        return mapRole(role);
      },
      async delete({ where }: any) { roles.delete(where.id); },
    },
    permission: {
      async findUnique({ where }: any) {
        if (where.name) return [...permissions.values()].find((p) => p.name === where.name) ?? null;
        if (where.id) return permissions.get(where.id) ?? null;
        return null;
      },
      async findMany({ where }: any) {
        let all = [...permissions.values()];
        if (where?.name?.in) all = all.filter((p) => (where.name.in as string[]).includes(p.name));
        return all;
      },
      async create({ data }: any) {
        const id = nextId();
        const record = { id, name: data.name, resource: data.resource, action: data.action, description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
        permissions.set(id, record);
        return record;
      },
      async update({ where, data }: any) {
        const p = permissions.get(where.id);
        if (!p) throw new Error('not found');
        Object.assign(p, data);
        return p;
      },
      async delete({ where }: any) { permissions.delete(where.id); },
    },
    rolePermission: {
      async findMany({ where, include }: any) {
        let rps = rolePermissions;
        if (where?.roleId?.in) rps = rps.filter((rp) => (where.roleId.in as string[]).includes(rp.roleId));
        return rps.map((rp) => ({ ...rp, permission: permissions.get(rp.permissionId) })).filter((rp) => rp.permission);
      },
      async createMany({ data, skipDuplicates }: any) {
        let count = 0;
        for (const d of data) {
          const dup = rolePermissions.some((rp) => rp.roleId === d.roleId && rp.permissionId === d.permissionId);
          if (!dup || !skipDuplicates) { rolePermissions.push(d); count++; }
        }
        return { count };
      },
      async deleteMany({ where }: any) {
        const toRemove = rolePermissions
          .map((rp, i) => (rp.roleId === where.roleId && (where.permissionId?.in as string[]).includes(rp.permissionId) ? i : -1))
          .filter((i) => i >= 0).reverse();
        for (const i of toRemove) rolePermissions.splice(i, 1);
        return { count: toRemove.length };
      },
    },
    roleAssignment: {
      async upsert({ where, create, update, include }: any) {
        const key = parseUniqueKey(where);
        const existing = key
          ? assignments.find(
              (a) =>
                a.userId === key.userId &&
                a.roleId === key.roleId &&
                a.scopeType === key.scopeType &&
                a.scopeId === key.scopeId,
            )
          : null;
        if (existing) {
          Object.assign(existing, update);
          return mapAssignment(existing);
        }
        const record = { id: nextId(), ...create };
        assignments.push(record);
        return mapAssignment(record);
      },
      async deleteMany({ where }: any) {
        const toRemove = assignments
          .map((a, i) =>
            a.userId === where.userId &&
            a.roleId === where.roleId &&
            a.scopeType === (where.scopeType ?? null) &&
            a.scopeId === (where.scopeId ?? null)
              ? i
              : -1,
          )
          .filter((i) => i >= 0).reverse();
        for (const i of toRemove) assignments.splice(i, 1);
        return { count: toRemove.length };
      },
      async findMany({ where }: any) {
        const now = new Date();
        return assignments
          .filter((a) => {
            if (a.userId !== where.userId) return false;
            if (where.scopeType !== undefined && a.scopeType !== where.scopeType) return false;
            if (where.scopeId !== undefined && a.scopeId !== where.scopeId) return false;
            if (a.expiresAt && a.expiresAt <= now) return false;
            return true;
          })
          .map(mapAssignment);
      },
    },
  };

  return { prisma, roles, permissions, rolePermissions, assignments, nextId };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildServices(opts: { throwOnUnauthorized?: boolean } = {}) {
  const store = makeStore();
  const roleService = new RoleService(store.prisma);
  const permService = new PermissionService(store.prisma);
  const authService = new AuthorizationService(
    roleService,
    permService,
    store.prisma,
    { throwOnUnauthorized: opts.throwOnUnauthorized ?? false },
  );
  return { store, roleService, permService, authService };
}

async function seedPermission(permService: PermissionService, name: string) {
  const [resource, action] = name.split(':');
  return permService.create({ name, resource, action: action ?? name });
}

async function seedRoleWithPerm(
  roleService: RoleService,
  permService: PermissionService,
  roleName: string,
  permNames: string[],
) {
  for (const p of permNames) await seedPermission(permService, p).catch(() => {}); // skip dup
  return roleService.create({ name: roleName, displayName: roleName, permissionNames: permNames });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthorizationService', () => {
  describe('assignRole / revokeRole', () => {
    it('assigns a role to a user', async () => {
      const { store, roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);

      const assignment = await authService.assignRole({ userId: 'user-1', roleName: 'viewer' });
      assert.equal(assignment.userId, 'user-1');
      assert.equal(assignment.role.name, 'viewer');
    });

    it('upserts duplicate role assignment', async () => {
      const { store, roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);

      await authService.assignRole({ userId: 'user-1', roleName: 'viewer' });
      const second = await authService.assignRole({ userId: 'user-1', roleName: 'viewer' });
      assert.equal(second.role.name, 'viewer');

      const roles = await authService.getUserRoles('user-1');
      assert.equal(roles.length, 1);
    });

    it('revokes a role from a user', async () => {
      const { roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);

      await authService.assignRole({ userId: 'user-2', roleName: 'viewer' });
      await authService.revokeRole({ userId: 'user-2', roleName: 'viewer' });

      const roles = await authService.getUserRoles('user-2');
      assert.equal(roles.length, 0);
    });

    it('throws when assigning unknown role', async () => {
      const { authService } = buildServices();
      await assert.rejects(
        () => authService.assignRole({ userId: 'user-3', roleName: 'ghost' }),
        (err: Error) => { assert.match(err.message, /not found/); return true; },
      );
    });
  });

  describe('authorize', () => {
    it('authorizes user with correct permission', async () => {
      const { roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'admin', ['contacts:read', 'contacts:write']);
      await authService.assignRole({ userId: 'admin-1', roleName: 'admin' });

      const result = await authService.authorize({ userId: 'admin-1', permission: 'contacts:read' });
      assert.equal(result.authorized, true);
    });

    it('denies user missing permission', async () => {
      const { roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);
      await authService.assignRole({ userId: 'viewer-1', roleName: 'viewer' });

      const result = await authService.authorize({ userId: 'viewer-1', permission: 'contacts:write' });
      assert.equal(result.authorized, false);
      assert.ok(result.reason);
    });

    it('throws ForbiddenException when throwOnUnauthorized=true', async () => {
      const { roleService, permService, authService } = buildServices({ throwOnUnauthorized: true });
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);
      await authService.assignRole({ userId: 'viewer-2', roleName: 'viewer' });

      await assert.rejects(
        () => authService.authorize({ userId: 'viewer-2', permission: 'contacts:delete' }),
        (err: Error) => { assert.match(err.message, /lacks permission/i); return true; },
      );
    });

    it('wildcard *:* grants all permissions', async () => {
      const { roleService, permService, authService } = buildServices();
      await seedPermission(permService, '*:*');
      await roleService.create({ name: 'super_admin', displayName: 'SA', permissionNames: ['*:*'] });
      await authService.assignRole({ userId: 'sa-1', roleName: 'super_admin' });

      const result = await authService.authorize({ userId: 'sa-1', permission: 'billing:manage' });
      assert.equal(result.authorized, true);
    });

    it('can() is a convenience wrapper', async () => {
      const { roleService, permService, authService } = buildServices();
      await seedRoleWithPerm(roleService, permService, 'member', ['orders:read']);
      await authService.assignRole({ userId: 'mem-1', roleName: 'member' });

      assert.equal(await authService.can('mem-1', 'orders:read'), true);
      assert.equal(await authService.can('mem-1', 'orders:delete'), false);
    });
  });

  describe('role hierarchy expansion', () => {
    it('manager inherits member and viewer permissions via hierarchy', async () => {
      const { roleService, permService, authService } = buildServices();

      // viewer: contacts:read
      await seedRoleWithPerm(roleService, permService, 'viewer', ['contacts:read']);
      // member: orders:read
      await seedRoleWithPerm(roleService, permService, 'member', ['orders:read']);
      // manager: invoicing:read (direct only)
      await seedRoleWithPerm(roleService, permService, 'manager', ['invoicing:read']);

      await authService.assignRole({ userId: 'mgr-1', roleName: 'manager' });

      // Manager should inherit member and viewer through hierarchy
      const perms = await authService.getUserPermissions('mgr-1');
      assert.ok(perms.includes('invoicing:read'), 'direct perm');
      assert.ok(perms.includes('orders:read'), 'inherited from member');
      assert.ok(perms.includes('contacts:read'), 'inherited from viewer');
    });
  });

  describe('getHighestRole', () => {
    it('returns the highest role in hierarchy', () => {
      const { authService } = buildServices();
      assert.equal(authService.getHighestRole(['viewer', 'admin', 'member']), 'admin');
    });

    it('returns first role if none match hierarchy', () => {
      const { authService } = buildServices();
      assert.equal(authService.getHighestRole(['custom-role']), 'custom-role');
    });

    it('returns null for empty list', () => {
      const { authService } = buildServices();
      assert.equal(authService.getHighestRole([]), null);
    });
  });

  describe('getUserPermissions', () => {
    it('returns empty array for user with no roles', async () => {
      const { authService } = buildServices();
      const perms = await authService.getUserPermissions('nobody');
      assert.deepEqual(perms, []);
    });
  });
});
