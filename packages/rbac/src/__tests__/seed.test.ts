import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seedRbac } from '../seed';
import { DEFAULT_ROLES, DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../constants';

// ─── Minimal Prisma mock ──────────────────────────────────────────────────────

function makeSeedPrisma() {
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const rolePermissions: Array<{ roleId: string; permissionId: string }> = [];

  return {
    roles,
    permissions,
    rolePermissions,
    role: {
      async findUnique({ where }: any) {
        return [...roles.values()].find((r) => r.name === where.name) ?? null;
      },
      async upsert({ where, create, update }: any) {
        const existing = [...roles.values()].find((r) => r.name === where.name);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: `role-${where.name}`, ...create };
        roles.set(record.id, record);
        return record;
      },
    },
    permission: {
      async findUnique({ where }: any) {
        return [...permissions.values()].find((p) => p.name === where.name) ?? null;
      },
      async findMany({ where }: any) {
        if (where?.name?.in) {
          return [...permissions.values()].filter((p) => (where.name.in as string[]).includes(p.name));
        }
        return [...permissions.values()];
      },
      async upsert({ where, create, update }: any) {
        const existing = [...permissions.values()].find((p) => p.name === where.name);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: `perm-${where.name}`, ...create, isActive: true };
        permissions.set(record.id, record);
        return record;
      },
    },
    rolePermission: {
      async createMany({ data, skipDuplicates }: any) {
        let count = 0;
        for (const d of data) {
          const dup = rolePermissions.some((rp) => rp.roleId === d.roleId && rp.permissionId === d.permissionId);
          if (!dup || !skipDuplicates) { rolePermissions.push(d); count++; }
        }
        return { count };
      },
    },
  };
}

describe('seedRbac', () => {
  it('seeds all default roles', async () => {
    const prisma = makeSeedPrisma();
    const result = await seedRbac(prisma);
    assert.equal(result.rolesUpserted, DEFAULT_ROLES.length);
    assert.equal(prisma.roles.size, DEFAULT_ROLES.length);

    for (const role of DEFAULT_ROLES) {
      const found = [...prisma.roles.values()].find((r) => r.name === role.name);
      assert.ok(found, `Role '${role.name}' should be seeded`);
      assert.equal(found.isSystem, true);
    }
  });

  it('seeds all default permissions', async () => {
    const prisma = makeSeedPrisma();
    const result = await seedRbac(prisma);
    assert.equal(result.permissionsUpserted, DEFAULT_PERMISSIONS.length);
    assert.equal(prisma.permissions.size, DEFAULT_PERMISSIONS.length);
  });

  it('wires role-permission assignments', async () => {
    const prisma = makeSeedPrisma();
    await seedRbac(prisma);
    assert.ok(prisma.rolePermissions.length > 0, 'Should have role-permission assignments');
  });

  it('super_admin gets wildcard *:* permission', async () => {
    const prisma = makeSeedPrisma();
    await seedRbac(prisma);

    const superAdminRole = [...prisma.roles.values()].find((r) => r.name === 'super_admin');
    assert.ok(superAdminRole);

    const wildcardPerm = [...prisma.permissions.values()].find((p) => p.name === '*:*');
    assert.ok(wildcardPerm);

    const hasPerm = prisma.rolePermissions.some(
      (rp) => rp.roleId === superAdminRole.id && rp.permissionId === wildcardPerm.id,
    );
    assert.ok(hasPerm, 'super_admin should have *:* permission');
  });

  it('is idempotent — safe to run twice', async () => {
    const prisma = makeSeedPrisma();
    await seedRbac(prisma);
    await seedRbac(prisma); // second run

    // Should not duplicate roles or permissions
    assert.equal(prisma.roles.size, DEFAULT_ROLES.length);
    assert.equal(prisma.permissions.size, DEFAULT_PERMISSIONS.length);
  });

  it('viewer role has only read permissions', async () => {
    const prisma = makeSeedPrisma();
    await seedRbac(prisma);

    const viewerRole = [...prisma.roles.values()].find((r) => r.name === 'viewer');
    assert.ok(viewerRole);

    const viewerPermIds = prisma.rolePermissions
      .filter((rp) => rp.roleId === viewerRole.id)
      .map((rp) => rp.permissionId);

    const viewerPerms = [...prisma.permissions.values()].filter((p) => viewerPermIds.includes(p.id));

    for (const perm of viewerPerms) {
      assert.equal(perm.action, 'read', `Viewer should only have read perms, got: ${perm.name}`);
    }
  });
});
