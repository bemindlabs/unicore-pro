import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import type { CreateRoleDto, UpdateRoleDto, RoleWithPermissions } from './types';

/**
 * RoleService — CRUD operations for roles.
 *
 * Expects a Prisma client instance injected via the PRISMA_SERVICE token.
 * The Prisma client must expose the `role`, `permission`, and `rolePermission` models.
 */
@Injectable()
export class RoleService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject('PRISMA_SERVICE') private readonly prisma: any,
  ) {}

  async findAll(): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'desc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return roles.map(this.mapRole);
  }

  async findByName(name: string): Promise<RoleWithPermissions | null> {
    const role = await this.prisma.role.findUnique({
      where: { name },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return role ? this.mapRole(role) : null;
  }

  async findById(id: string): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role '${id}' not found`);
    }

    return this.mapRole(role);
  }

  async create(dto: CreateRoleDto): Promise<RoleWithPermissions> {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Role '${dto.name}' already exists`);
    }

    // Resolve permission IDs from names if provided
    const permissionIds = dto.permissionNames?.length
      ? await this.resolvePermissionIds(dto.permissionNames)
      : [];

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description,
        isSystem: dto.isSystem ?? false,
        sortOrder: dto.sortOrder ?? 0,
        permissions: permissionIds.length
          ? {
              create: permissionIds.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return this.mapRole(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role '${id}' not found`);
    }

    // Prevent modifying system roles' core fields
    if (role.isSystem && dto.permissionNames !== undefined) {
      // Allow updating permissions even on system roles (admin override)
    }

    // If permissionNames provided, replace all permissions atomically
    const permissionUpdateData =
      dto.permissionNames !== undefined
        ? {
            permissions: {
              deleteMany: {},
              create: (await this.resolvePermissionIds(dto.permissionNames)).map(
                (permissionId) => ({ permissionId }),
              ),
            },
          }
        : {};

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...permissionUpdateData,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return this.mapRole(updated);
  }

  async delete(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role '${id}' not found`);
    }
    if (role.isSystem) {
      throw new BadRequestException(`System role '${role.name}' cannot be deleted`);
    }

    await this.prisma.role.delete({ where: { id } });
  }

  async addPermissions(roleId: string, permissionNames: string[]): Promise<RoleWithPermissions> {
    await this.findById(roleId); // validates existence

    const permissionIds = await this.resolvePermissionIds(permissionNames);

    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });

    return this.findById(roleId);
  }

  async removePermissions(roleId: string, permissionNames: string[]): Promise<RoleWithPermissions> {
    await this.findById(roleId);

    const permissionIds = await this.resolvePermissionIds(permissionNames);

    await this.prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { in: permissionIds },
      },
    });

    return this.findById(roleId);
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async resolvePermissionIds(names: string[]): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });

    const found = new Set(permissions.map((p: { name: string }) => p.name));
    const missing = names.filter((n) => !found.has(n));
    if (missing.length > 0) {
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }

    return permissions.map((p: { id: string }) => p.id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRole(role: any): RoleWithPermissions {
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      sortOrder: role.sortOrder,
      permissions: (role.permissions ?? []).map((rp: any) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
    };
  }
}
