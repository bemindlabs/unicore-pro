import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from './constants';

/**
 * seedRbac — idempotent seed function for RBAC defaults.
 *
 * Creates the 5 system roles, all default permissions, and the role–permission matrix.
 * Safe to call multiple times (uses upsert / createMany with skipDuplicates).
 *
 * @param prisma — Prisma client instance
 * @returns summary of upserted records
 */
export async function seedRbac(prisma: any): Promise<{
  rolesUpserted: number;
  permissionsUpserted: number;
  assignmentsCreated: number;
}> {
  // ── 1. Upsert permissions ──────────────────────────────────────────────────
  for (const perm of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      create: {
        name: perm.name,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      },
      update: {
        description: perm.description,
        isActive: true,
      },
    });
  }

  // ── 2. Upsert roles ────────────────────────────────────────────────────────
  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        isSystem: true,
        sortOrder: role.sortOrder,
      },
      update: {
        displayName: role.displayName,
        description: role.description,
        isSystem: true,
        sortOrder: role.sortOrder,
        isActive: true,
      },
    });
  }

  // ── 3. Wire role ↔ permission assignments ─────────────────────────────────
  let assignmentsCreated = 0;

  for (const [roleName, permNames] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    const permissions = await prisma.permission.findMany({
      where: { name: { in: permNames } },
      select: { id: true },
    });

    const result = await prisma.rolePermission.createMany({
      data: permissions.map((p: { id: string }) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    assignmentsCreated += result.count;
  }

  return {
    rolesUpserted: DEFAULT_ROLES.length,
    permissionsUpserted: DEFAULT_PERMISSIONS.length,
    assignmentsCreated,
  };
}
