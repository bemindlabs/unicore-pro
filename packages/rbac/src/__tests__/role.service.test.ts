import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoleService } from '../role.service';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

function makePrismaMock() {
  const roles: Map<string, any> = new Map();
  const permissions: Map<string, any> = new Map();
  const rolePermissions: Array<{ roleId: string; permissionId: string }> = [];
  let idCounter = 1;

  // Pre-seed a permission for test use
  const seedPerm = { id: 'perm-1', name: 'contacts:read', resource: 'contacts', action: 'read', description: null };
  permissions.set('perm-1', seedPerm);

  function mapRoleWithPerms(role: any) {
    const perms = rolePermissions
      .filter((rp) => rp.roleId === role.id)
      .map((rp) => ({ permission: permissions.get(rp.permissionId) }))
      .filter((rp) => rp.permission);
    return { ...role, permissions: perms };
  }

  return {
    role: {
      async findMany({ where, orderBy, include }: any) {
        let all = [...roles.values()];
        if (where?.isActive !== undefined) all = all.filter((r) => r.isActive === where.isActive);
        return all.map(mapRoleWithPerms);
      },
      async findUnique({ where, include }: any) {
        let role: any = null;
        if (where.id) role = roles.get(where.id) ?? null;
        if (where.name) role = [...roles.values()].find((r) => r.name === where.name) ?? null;
        return role ? mapRoleWithPerms(role) : null;
      },
      async create({ data, include }: any) {
        const id = String(idCounter++);
        const record: any = {
          id,
          name: data.name,
          displayName: data.displayName,
          description: data.description ?? null,
          isSystem: data.isSystem ?? false,
          isActive: true,
          sortOrder: data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        roles.set(id, record);
        // Handle inline permission creates
        if (data.permissions?.create) {
          for (const { permissionId } of data.permissions.create) {
            rolePermissions.push({ roleId: id, permissionId });
          }
        }
        return mapRoleWithPerms(record);
      },
      async update({ where, data, include }: any) {
        const role = roles.get(where.id);
        if (!role) throw new Error('not found');
        Object.assign(role, {
          ...(data.displayName !== undefined && { displayName: data.displayName }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          updatedAt: new Date(),
        });
        if (data.permissions?.deleteMany !== undefined) {
          // Remove all role perms
          const indices = rolePermissions
            .map((rp, i) => (rp.roleId === role.id ? i : -1))
            .filter((i) => i >= 0)
            .reverse();
          for (const i of indices) rolePermissions.splice(i, 1);
        }
        if (data.permissions?.create) {
          for (const { permissionId } of data.permissions.create) {
            rolePermissions.push({ roleId: role.id, permissionId });
          }
        }
        return mapRoleWithPerms(role);
      },
      async delete({ where }: any) {
        roles.delete(where.id);
      },
    },
    permission: {
      async findMany({ where }: any) {
        if (where?.name?.in) {
          return [...permissions.values()].filter((p) => (where.name.in as string[]).includes(p.name));
        }
        return [...permissions.values()];
      },
    },
    rolePermission: {
      async createMany({ data, skipDuplicates }: any) {
        let count = 0;
        for (const entry of data) {
          const dup = rolePermissions.some(
            (rp) => rp.roleId === entry.roleId && rp.permissionId === entry.permissionId,
          );
          if (!dup || !skipDuplicates) {
            rolePermissions.push(entry);
            count++;
          }
        }
        return { count };
      },
      async deleteMany({ where }: any) {
        const toRemove = rolePermissions
          .map((rp, i) =>
            rp.roleId === where.roleId &&
            (where.permissionId?.in as string[]).includes(rp.permissionId)
              ? i
              : -1,
          )
          .filter((i) => i >= 0)
          .reverse();
        for (const i of toRemove) rolePermissions.splice(i, 1);
        return { count: toRemove.length };
      },
    },
  };
}

describe('RoleService', () => {
  let service: RoleService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new RoleService(prisma);
  });

  it('creates a role', async () => {
    const role = await service.create({
      name: 'admin',
      displayName: 'Admin',
      description: 'Admin role',
    });
    assert.equal(role.name, 'admin');
    assert.equal(role.displayName, 'Admin');
    assert.equal(role.isSystem, false);
  });

  it('creates a role with permissions', async () => {
    const role = await service.create({
      name: 'reader',
      displayName: 'Reader',
      permissionNames: ['contacts:read'],
    });
    assert.equal(role.permissions.length, 1);
    assert.equal(role.permissions[0].name, 'contacts:read');
  });

  it('throws ConflictException for duplicate role name', async () => {
    await service.create({ name: 'viewer', displayName: 'Viewer' });
    await assert.rejects(
      () => service.create({ name: 'viewer', displayName: 'Viewer2' }),
      (err: Error) => {
        assert.match(err.message, /already exists/);
        return true;
      },
    );
  });

  it('finds role by name', async () => {
    await service.create({ name: 'manager', displayName: 'Manager' });
    const found = await service.findByName('manager');
    assert.ok(found);
    assert.equal(found.displayName, 'Manager');
  });

  it('returns null for unknown role name', async () => {
    const found = await service.findByName('nonexistent');
    assert.equal(found, null);
  });

  it('finds role by id', async () => {
    const created = await service.create({ name: 'member', displayName: 'Member' });
    const found = await service.findById(created.id);
    assert.equal(found.id, created.id);
  });

  it('throws NotFoundException for unknown role id', async () => {
    await assert.rejects(
      () => service.findById('does-not-exist'),
      (err: Error) => {
        assert.match(err.message, /not found/);
        return true;
      },
    );
  });

  it('updates role display name', async () => {
    const created = await service.create({ name: 'ops', displayName: 'Ops' });
    const updated = await service.update(created.id, { displayName: 'Operations' });
    assert.equal(updated.displayName, 'Operations');
  });

  it('replaces permissions on update', async () => {
    const created = await service.create({
      name: 'tester',
      displayName: 'Tester',
      permissionNames: ['contacts:read'],
    });
    assert.equal(created.permissions.length, 1);

    const updated = await service.update(created.id, { permissionNames: [] });
    assert.equal(updated.permissions.length, 0);
  });

  it('deletes a non-system role', async () => {
    const created = await service.create({ name: 'custom', displayName: 'Custom' });
    await service.delete(created.id);
    const found = await service.findByName('custom');
    assert.equal(found, null);
  });

  it('throws BadRequestException when deleting a system role', async () => {
    const created = await service.create({ name: 'sys', displayName: 'System', isSystem: true });
    await assert.rejects(
      () => service.delete(created.id),
      (err: Error) => {
        assert.match(err.message, /cannot be deleted/i);
        return true;
      },
    );
  });

  it('adds permissions to role', async () => {
    const created = await service.create({ name: 'role2', displayName: 'Role2' });
    const updated = await service.addPermissions(created.id, ['contacts:read']);
    assert.equal(updated.permissions.length, 1);
  });

  it('removes permissions from role', async () => {
    const created = await service.create({
      name: 'role3',
      displayName: 'Role3',
      permissionNames: ['contacts:read'],
    });
    const updated = await service.removePermissions(created.id, ['contacts:read']);
    assert.equal(updated.permissions.length, 0);
  });

  it('findAll returns active roles', async () => {
    await service.create({ name: 'r1', displayName: 'R1' });
    await service.create({ name: 'r2', displayName: 'R2' });
    const all = await service.findAll();
    assert.ok(all.length >= 2);
  });
});
