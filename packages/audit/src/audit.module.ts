import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService, AUDIT_MODULE_OPTIONS, PRISMA_SERVICE_TOKEN } from './audit.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditModuleOptions } from './types.js';

// ─── Async options interface (mirrors NestJS conventions) ─────────────────────

export interface AuditModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<AuditModuleOptions> | AuditModuleOptions;
  inject?: (string | symbol | Type<unknown>)[];
}

/**
 * AuditModule — NestJS dynamic module for audit logging.
 *
 * ### Quick-start (synchronous)
 * ```ts
 * @Module({
 *   imports: [
 *     AuditModule.register({
 *       prismaServiceToken: 'PrismaService',
 *       logFailures: true,
 *       maxQueryLimit: 500,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ### Async (reads config from ConfigService, etc.)
 * ```ts
 * AuditModule.registerAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (cfg: ConfigService) => ({
 *     prismaServiceToken: 'PrismaService',
 *     resourcePrefix: cfg.get('TENANT_ID'),
 *   }),
 * })
 * ```
 *
 * ### Exports
 * The module exports `AuditService` and `AuditInterceptor` so they can be
 * injected anywhere in the consuming application.
 */
@Module({})
export class AuditModule {
  // ─── Synchronous registration ───────────────────────────────────────────────

  static register(options: AuditModuleOptions = {}): DynamicModule {
    const prismaToken = options.prismaServiceToken ?? PRISMA_SERVICE_TOKEN;

    const optionsProvider: Provider = {
      provide: AUDIT_MODULE_OPTIONS,
      useValue: options,
    };

    return {
      module: AuditModule,
      providers: [
        optionsProvider,
        {
          provide: PRISMA_SERVICE_TOKEN,
          useExisting: prismaToken,
        },
        AuditService,
        AuditInterceptor,
        Reflector,
      ],
      exports: [AuditService, AuditInterceptor],
    };
  }

  // ─── Async registration ─────────────────────────────────────────────────────

  static registerAsync(asyncOptions: AuditModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: FactoryProvider = {
      provide: AUDIT_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject as Parameters<typeof asyncOptionsProvider['inject'] extends infer T ? () => T : never>[]) ?? [],
    };

    return {
      module: AuditModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        asyncOptionsProvider,
        {
          provide: PRISMA_SERVICE_TOKEN,
          useFactory: (opts: AuditModuleOptions) => opts.prismaServiceToken ?? PRISMA_SERVICE_TOKEN,
          inject: [AUDIT_MODULE_OPTIONS],
        },
        AuditService,
        AuditInterceptor,
        Reflector,
      ],
      exports: [AuditService, AuditInterceptor],
    };
  }
}
