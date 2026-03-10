/**
 * JitProvisionerService — Just-In-Time user provisioning from SAML assertions.
 *
 * On a successful SAML login, if the user does not exist in the system, JIT
 * provisioning creates the user account automatically.  It also handles role
 * assignment based on SAML group membership.
 */

import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type {
  JitProvisionInput,
  JitProvisionResult,
} from '../types/sso.types.js';
import { isEmailDomainAllowed } from '../helpers/saml.helpers.js';

@Injectable()
export class JitProvisionerService {
  private readonly logger = new Logger(JitProvisionerService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Provisions (or returns) a user based on SAML attributes.
   *
   * Algorithm:
   * 1. Validate email domain against jitAllowedDomains.
   * 2. Look up the user by email.
   * 3. If not found, create a new user record and a ProvisionedUser record.
   * 4. If found, update last login stats.
   * 5. Resolve the role to assign from jitGroupRoleMap or jitDefaultRole.
   */
  async provision(input: JitProvisionInput): Promise<JitProvisionResult> {
    const { organizationId, provider, config, attributes } = input;

    if (!config.jitEnabled) {
      throw new ForbiddenException(
        'JIT provisioning is disabled for this organization',
      );
    }

    // Domain allow-list check
    if (!isEmailDomainAllowed(attributes.email, config.jitAllowedDomains)) {
      throw new ForbiddenException(
        `Email domain for ${attributes.email} is not in the JIT allowed list`,
      );
    }

    // --- Resolve role ---
    const assignedRole = this.resolveRole(attributes.groups ?? [], config.jitGroupRoleMap, config.jitDefaultRole);

    // --- Look up existing user ---
    // We depend on the community @unicore/shared-types User shape but access
    // via raw Prisma to avoid a hard compile-time dependency on the app schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingUser = await (this.prisma as any).user?.findUnique({
      where: { email: attributes.email },
    });

    if (existingUser) {
      // Update last login tracking
      await this.updateLoginStats(existingUser.id, attributes);
      return {
        userId: existingUser.id as string,
        email: attributes.email,
        isNewUser: false,
        assignedRole,
      };
    }

    // --- Create new user ---
    const newUser = await this.createUser({
      organizationId,
      email: attributes.email,
      firstName: attributes.firstName,
      lastName: attributes.lastName,
      displayName: attributes.displayName,
    });

    // Track provisioning metadata
    await this.prisma.provisionedUser.create({
      data: {
        userId: newUser.id,
        organizationId,
        provider,
        nameId: attributes.nameId,
        nameIdFormat: attributes.nameIdFormat,
        samlAttributes: attributes.raw,
        lastLoginAt: new Date(),
        loginCount: 1,
      },
    });

    this.logger.log(
      `JIT: provisioned new user ${newUser.id} (${attributes.email}) via ${provider}`,
    );

    return {
      userId: newUser.id,
      email: attributes.email,
      isNewUser: true,
      assignedRole,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the role to assign based on SAML group membership.
   * Group → role mappings take priority; falls back to jitDefaultRole.
   */
  private resolveRole(
    groups: string[],
    groupRoleMap?: Record<string, string>,
    defaultRole?: string,
  ): string | undefined {
    if (groupRoleMap) {
      for (const group of groups) {
        const role = groupRoleMap[group];
        if (role) return role;
      }
    }
    return defaultRole;
  }

  /**
   * Creates a minimal user record.
   * The actual User model lives in the community package — we write to it
   * via raw Prisma to stay loosely coupled.
   */
  private async createUser(data: {
    organizationId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
  }): Promise<{ id: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    if (!prismaAny.user) {
      throw new Error(
        'Prisma client does not have a "user" model. ' +
        'Ensure the community schema is merged before running migrations.',
      );
    }

    return prismaAny.user.create({
      data: {
        email: data.email,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        displayName: data.displayName ?? data.email,
        organizationId: data.organizationId,
        isEmailVerified: true, // SSO asserts the email
        authProvider: 'saml',
      },
      select: { id: true },
    });
  }

  /**
   * Updates login stats on the ProvisionedUser record (best effort).
   */
  private async updateLoginStats(
    userId: string,
    attributes: JitProvisionInput['attributes'],
  ): Promise<void> {
    try {
      await this.prisma.provisionedUser.upsert({
        where: { userId },
        update: {
          lastLoginAt: new Date(),
          loginCount: { increment: 1 },
          samlAttributes: attributes.raw,
        },
        create: {
          userId,
          organizationId: 'unknown',
          provider: 'custom',
          nameId: attributes.nameId,
          nameIdFormat: attributes.nameIdFormat,
          samlAttributes: attributes.raw,
          lastLoginAt: new Date(),
          loginCount: 1,
        },
      });
    } catch {
      // Non-fatal — don't block login if stat tracking fails
      this.logger.warn(`Failed to update login stats for user ${userId}`);
    }
  }
}
