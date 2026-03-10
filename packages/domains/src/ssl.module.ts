/**
 * SslModule — NestJS dynamic module for @unicore/domains SSL provisioning.
 *
 * Usage (static):
 *   SslModule.register({ cloudflareApiToken: 'cf_token_...', defaultSslMode: 'full' })
 *
 * Usage (async, e.g. from ConfigService):
 *   SslModule.registerAsync({
 *     useFactory: (cfg: ConfigService) => ({
 *       cloudflareApiToken: cfg.get<string>('CF_API_TOKEN')!,
 *     }),
 *     inject: [ConfigService],
 *   })
 */

import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SslService, SSL_PRISMA } from './services/ssl.service.js';
import { SslMonitorService } from './services/ssl-monitor.service.js';
import { CloudflareSslClient } from './services/cloudflare-ssl.client.js';
import { SslController } from './controllers/ssl.controller.js';
import { SSL_MODULE_OPTIONS } from './ssl.constants.js';
import type { SslModuleOptions } from './types/ssl.types.js';

// ---------------------------------------------------------------------------
// Async options
// ---------------------------------------------------------------------------

export interface SslModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<SslModuleOptions> | SslModuleOptions;
  inject?: (string | symbol | Type<unknown>)[];
  imports?: DynamicModule['imports'];
  extraProviders?: Provider[];
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

const SSL_PROVIDERS: Provider[] = [
  SslService,
  SslMonitorService,
  CloudflareSslClient,
  EventEmitter2,
];

@Module({})
export class SslModule {
  /**
   * Registers the SslModule with static options.
   *
   * @param options - Cloudflare token, SSL mode defaults, monitor settings.
   * @param prismaProvider - Bind the Prisma client.
   *   Pass `{ provide: SSL_PRISMA, useExisting: PrismaService }` to share your app's Prisma.
   */
  static register(options: SslModuleOptions, prismaProvider?: Provider): DynamicModule {
    const defaultPrismaProvider: Provider = {
      provide: SSL_PRISMA,
      useValue: null,
    };

    return {
      module: SslModule,
      controllers: [SslController],
      providers: [
        { provide: SSL_MODULE_OPTIONS, useValue: options },
        prismaProvider ?? defaultPrismaProvider,
        ...SSL_PROVIDERS,
      ],
      exports: [SslService, SslMonitorService, CloudflareSslClient],
    };
  }

  /**
   * Registers the SslModule with asynchronous options (e.g. from ConfigService).
   */
  static registerAsync(
    asyncOptions: SslModuleAsyncOptions,
    prismaProvider?: Provider,
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: SSL_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject ?? []) as never[],
    };

    const defaultPrismaProvider: Provider = {
      provide: SSL_PRISMA,
      useValue: null,
    };

    return {
      module: SslModule,
      imports: asyncOptions.imports ?? [],
      controllers: [SslController],
      providers: [
        optionsProvider,
        prismaProvider ?? defaultPrismaProvider,
        ...(asyncOptions.extraProviders ?? []),
        ...SSL_PROVIDERS,
      ],
      exports: [SslService, SslMonitorService, CloudflareSslClient],
    };
  }
}
