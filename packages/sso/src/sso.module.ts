/**
 * SsoModule — NestJS dynamic module for @unicore/sso.
 *
 * Usage (static):
 *   SsoModule.register({ baseUrl: 'https://app.unicore.io' })
 *
 * Usage (async, e.g. from ConfigService):
 *   SsoModule.registerAsync({
 *     useFactory: (cfg: ConfigService) => ({
 *       baseUrl: cfg.get<string>('APP_URL')!,
 *     }),
 *     inject: [ConfigService],
 *   })
 */

import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { SsoService } from './services/sso.service.js';
import { SsoConfigService } from './services/sso-config.service.js';
import { JitProvisionerService } from './services/jit-provisioner.service.js';
import { SsoController } from './controllers/sso.controller.js';
import { SsoAuthGuard } from './guards/sso-auth.guard.js';
import { SSO_MODULE_OPTIONS } from './sso.constants.js';
import type { SsoModuleOptions } from './types/sso.types.js';

// ---------------------------------------------------------------------------
// Async options support
// ---------------------------------------------------------------------------

export interface SsoModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<SsoModuleOptions> | SsoModuleOptions;
  inject?: (string | symbol | Type<unknown>)[];
  imports?: DynamicModule['imports'];
  extraProviders?: Provider[];
}

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

const SSO_PROVIDERS: Provider[] = [
  SsoService,
  SsoConfigService,
  JitProvisionerService,
  SsoAuthGuard,
];

@Module({})
export class SsoModule {
  /**
   * Registers the SsoModule with static options.
   */
  static register(options: SsoModuleOptions): DynamicModule {
    return {
      module: SsoModule,
      controllers: [SsoController],
      providers: [
        {
          provide: SSO_MODULE_OPTIONS,
          useValue: options,
        },
        ...SSO_PROVIDERS,
      ],
      exports: [SsoService, SsoConfigService, JitProvisionerService, SsoAuthGuard],
    };
  }

  /**
   * Registers the SsoModule with asynchronous options (e.g. from ConfigService).
   */
  static registerAsync(asyncOptions: SsoModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: SSO_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject ?? []) as never[],
    };

    return {
      module: SsoModule,
      imports: asyncOptions.imports ?? [],
      controllers: [SsoController],
      providers: [
        optionsProvider,
        ...(asyncOptions.extraProviders ?? []),
        ...SSO_PROVIDERS,
      ],
      exports: [SsoService, SsoConfigService, JitProvisionerService, SsoAuthGuard],
    };
  }
}
