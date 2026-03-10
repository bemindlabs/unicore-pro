import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRbacStep2 } from '../bootstrap';

// ─── Reuse the seed-compatible prisma mock ────────────────────────────────────

function makeBootstrapPrisma() {
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const rolePermissions: Array<{ roleId: string; permissionId: string }> = [];
  const assignments: Array<any> = [];

  function parseKey(where: any) {
    return where.userId_roleId_scopeType_scopeId;
  }

  return {
    roles,
    assignments,
    role: {
      async findUnique({ where }: any) {
        return [...roles.values()].find((r) => r.name === where.name) ?? null;
      },
      async upsert({ where, create, update }: any) {
        const existing = [...roles.values()].find((r) => r.name === where.name);
        if (existing) { Object.assign(existing, update); return existing; }
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
        if (existing) { Object.assign(existing, update); return existing; }
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
    roleAssignment: {
      async upsert({ where, create, update }: any) {
        const key = parseKey(where);
        const existing = key
          ? assignments.find(
              (a) =>
                a.userId === key.userId &&
                a.roleId === key.roleId &&
                a.scopeType === (key.scopeType ?? null) &&
                a.scopeId === (key.scopeId ?? null),
            )
          : null;
        if (existing) { Object.assign(existing, update); return existing; }
        const record = { id: `ra-${assignments.length}`, ...create };
        assignments.push(record);
        return record;
      },
    },
  };
}

describe('bootstrapRbacStep2', () => {
  it('seeds defaults and assigns super_admin to owner', async () => {
    const prisma = makeBootstrapPrisma();
    const result = await bootstrapRbacStep2(prisma, 'owner-user-1');

    assert.equal(result.ownerAssigned, true);
    assert.equal(result.seeded.rolesUpserted, 5);
    assert.ok(result.seeded.permissionsUpserted > 0);

    // Owner should have super_admin assignment
    const superAdminRole = [...prisma.roles.values()].find((r) => r.name === 'super_admin');
    assert.ok(superAdminRole);
    const ownerAssignment = prisma.assignments.find(
      (a) => a.userId === 'owner-user-1' && a.roleId === superAdminRole.id,
    );
    assert.ok(ownerAssignment, 'Owner should be assigned super_admin');
  });

  it('assigns roles to team members', async () => {
    const prisma = makeBootstrapPrisma();
    const result = await bootstrapRbacStep2(prisma, 'owner-1', [
      { userId: 'user-a', roleName: 'admin' },
      { userId: 'user-b', roleName: 'viewer' },
    ]);

    assert.equal(result.teamAssignments.length, 2);
    assert.equal(result.teamAssignments[0].success, true);
    assert.equal(result.teamAssignments[1].success, true);

    assert.equal(prisma.assignments.length, 3); // owner + user-a + user-b
  });

  it('reports error for team member with unknown role', async () => {
    const prisma = makeBootstrapPrisma();
    const result = await bootstrapRbacStep2(prisma, 'owner-1', [
      { userId: 'user-x', roleName: 'nonexistent-role' },
    ]);

    assert.equal(result.teamAssignments.length, 1);
    assert.equal(result.teamAssignments[0].success, false);
    assert.ok(result.teamAssignments[0].error);
  });

  it('is idempotent when called twice', async () => {
    const prisma = makeBootstrapPrisma();
    await bootstrapRbacStep2(prisma, 'owner-1');
    const second = await bootstrapRbacStep2(prisma, 'owner-1');

    // Should still succeed and not duplicate assignments
    assert.equal(second.ownerAssigned, true);
    const ownerAssignments = prisma.assignments.filter((a) => a.userId === 'owner-1');
    assert.equal(ownerAssignments.length, 1, 'Should not duplicate owner assignment');
  });
});
