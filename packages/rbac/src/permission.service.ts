import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import type { CreatePermissionDto, UpdatePermissionDto } from './types';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PermissionService — CRUD for permissions and point-in-time permission checks.
 *
 * Permission names follow the `resource:action` convention, e.g. `contacts:read`.
 * The wildcard `*:*` grants all permissions.
 */
@Injectable()
export class PermissionService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject('PRISMA_SERVICE') private readonly prisma: any,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findByName(name: string): Promise<Permission | null> {
    return this.prisma.permission.findUnique({ where: { name } });
  }

  async findById(id: string): Promise<Permission> {
    const perm = await this.prisma.permission.findUnique({ where: { id } });
    if (!perm) {
      throw new NotFoundException(`Permission '${id}' not found`);
    }
    return perm;
  }

  async findByResource(resource: string): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { resource, isActive: true },
      orderBy: { action: 'asc' },
    });
  }

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.prisma.permission.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Permission '${dto.name}' already exists`);
    }

    return this.prisma.permission.create({
      data: {
        name: dto.name,
        resource: dto.resource,
        action: dto.action,
        description: dto.description,
      },
    });
  }

  async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    await this.findById(id); // validate existence

    return this.prisma.permission.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.permission.delete({ where: { id } });
  }

  /**
   * Check whether the given set of permission names satisfies a required permission.
   *
   * Supports wildcard `*:*` and partial wildcards like `contacts:*`.
   */
  hasPermission(grantedPermissions: string[], required: string): boolean {
    if (grantedPermissions.includes('*:*')) return true;

    if (grantedPermissions.includes(required)) return true;

    // Support resource-level wildcard: e.g. "contacts:*" satisfies "contacts:read"
    const [resource] = required.split(':');
    if (grantedPermissions.includes(`${resource}:*`)) return true;

    return false;
  }

  /**
   * Resolve all permissions names for the given role IDs from the database.
   * Returns a deduplicated string array.
   */
  async getPermissionsForRoles(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];

    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: { select: { name: true } } },
    });

    const names = rows.map((r: { permission: { name: string } }) => r.permission.name);
    return [...new Set<string>(names)];
  }
}
