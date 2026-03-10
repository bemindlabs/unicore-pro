import { seedRbac } from './seed';

/**
 * bootstrapRbacStep2 — Bootstrap Wizard Step 2 integration helper.
 *
 * Called during the "Team & Roles" wizard step to:
 * 1. Ensure default RBAC data is seeded.
 * 2. Assign the super_admin role to the founding user.
 * 3. Optionally invite additional team members with specified roles.
 *
 * @param prisma     — Prisma client instance
 * @param ownerUserId — ID of the user who completed Step 1 (becomes super_admin)
 * @param teamMembers — Optional list of additional users to assign roles
 */
export interface TeamMemberInput {
  userId: string;
  roleName: string;
}

export interface BootstrapStep2Result {
  seeded: {
    rolesUpserted: number;
    permissionsUpserted: number;
    assignmentsCreated: number;
  };
  ownerAssigned: boolean;
  teamAssignments: Array<{ userId: string; roleName: string; success: boolean; error?: string }>;
}

export async function bootstrapRbacStep2(
  prisma: any,
  ownerUserId: string,
  teamMembers: TeamMemberInput[] = [],
): Promise<BootstrapStep2Result> {
  // ── Step 1: Ensure defaults exist ─────────────────────────────────────────
  const seeded = await seedRbac(prisma);

  // ── Step 2: Assign super_admin to owner ───────────────────────────────────
  let ownerAssigned = false;

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  if (superAdminRole) {
    await prisma.roleAssignment.upsert({
      where: {
        userId_roleId_scopeType_scopeId: {
          userId: ownerUserId,
          roleId: superAdminRole.id,
          scopeType: null,
          scopeId: null,
        },
      },
      create: {
        userId: ownerUserId,
        roleId: superAdminRole.id,
        scopeType: null,
        scopeId: null,
        assignedBy: ownerUserId,
      },
      update: {},
    });
    ownerAssigned = true;
  }

  // ── Step 3: Assign roles to team members ──────────────────────────────────
  const teamAssignments: BootstrapStep2Result['teamAssignments'] = [];

  for (const member of teamMembers) {
    try {
      const role = await prisma.role.findUnique({ where: { name: member.roleName } });
      if (!role) {
        teamAssignments.push({
          userId: member.userId,
          roleName: member.roleName,
          success: false,
          error: `Role '${member.roleName}' not found`,
        });
        continue;
      }

      await prisma.roleAssignment.upsert({
        where: {
          userId_roleId_scopeType_scopeId: {
            userId: member.userId,
            roleId: role.id,
            scopeType: null,
            scopeId: null,
          },
        },
        create: {
          userId: member.userId,
          roleId: role.id,
          scopeType: null,
          scopeId: null,
          assignedBy: ownerUserId,
        },
        update: {},
      });

      teamAssignments.push({ userId: member.userId, roleName: member.roleName, success: true });
    } catch (err) {
      teamAssignments.push({
        userId: member.userId,
        roleName: member.roleName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { seeded, ownerAssigned, teamAssignments };
}
