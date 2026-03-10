import { Module, DynamicModule, Global } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleService } from './role.service';
import { PermissionService } from './permission.service';
import { AuthorizationService } from './authorization.service';
import { RbacGuard } from './rbac.guard';
import type { RbacModuleOptions } from './types';
import { DEFAULT_ROLE_HIERARCHY } from './constants';

/**
 * RbacModule — NestJS dynamic module providing RBAC services and guards.
 *
 * Usage:
 *
 * ```ts
 * // app.module.ts
 * @Module({
 *   imports: [
 *     RbacModule.forRoot({
 *       prismaServiceToken: PrismaService,
 *       throwOnUnauthorized: true,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * The consuming application must provide a Prisma service bound to the
 * `prismaServiceToken` (default: `'PrismaService'`). That service must
 * expose the Prisma models: `role`, `permission`, `rolePermission`, `roleAssignment`.
 */
@Global()
@Module({})
export class RbacModule {
  static forRoot(options: RbacModuleOptions = {}): DynamicModule {
    const prismaToken = options.prismaServiceToken ?? 'PrismaService';
    const rbacOptions = {
      roleHierarchy: options.roleHierarchy ?? DEFAULT_ROLE_HIERARCHY,
      throwOnUnauthorized: options.throwOnUnauthorized ?? true,
    };

    const prismaProvider = {
      provide: 'PRISMA_SERVICE',
      useExisting: prismaToken,
    };

    const optionsProvider = {
      provide: 'RBAC_OPTIONS',
      useValue: rbacOptions,
    };

    return {
      module: RbacModule,
      providers: [
        prismaProvider,
        optionsProvider,
        Reflector,
        RoleService,
        PermissionService,
        AuthorizationService,
        RbacGuard,
      ],
      exports: [
        RoleService,
        PermissionService,
        AuthorizationService,
        RbacGuard,
        Reflector,
      ],
    };
  }

  /**
   * Register for testing — provide a mock Prisma instance directly.
   */
  static forTest(mockPrisma: unknown, options: Omit<RbacModuleOptions, 'prismaServiceToken'> = {}): DynamicModule {
    const rbacOptions = {
      roleHierarchy: options.roleHierarchy ?? DEFAULT_ROLE_HIERARCHY,
      throwOnUnauthorized: options.throwOnUnauthorized ?? false,
    };

    return {
      module: RbacModule,
      providers: [
        { provide: 'PRISMA_SERVICE', useValue: mockPrisma },
        { provide: 'RBAC_OPTIONS', useValue: rbacOptions },
        Reflector,
        RoleService,
        PermissionService,
        AuthorizationService,
        RbacGuard,
      ],
      exports: [
        RoleService,
        PermissionService,
        AuthorizationService,
        RbacGuard,
        Reflector,
      ],
    };
  }
}
