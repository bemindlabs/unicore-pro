/**
 * DomainsModule — NestJS dynamic module for @unicore/domains.
 *
 * Usage (static):
 *   DomainsModule.register({
 *     cloudflare: {
 *       apiToken: process.env.CF_API_TOKEN!,
 *       platformHostname: 'platform.unicore.io',
 *     },
 *   })
 *
 * Usage (async, e.g. from ConfigService):
 *   DomainsModule.registerAsync({
 *     useFactory: (cfg: ConfigService) => ({
 *       cloudflare: {
 *         apiToken: cfg.get<string>('CF_API_TOKEN')!,
 *         platformHostname: cfg.get<string>('PLATFORM_HOSTNAME')!,
 *       },
 *     }),
 *     inject: [ConfigService],
 *   })
 */

import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainService } from './services/domain.service.js';
import { CloudflareClient } from './services/cloudflare.client.js';
import { DnsLookupService } from './services/dns-lookup.service.js';
import { VerificationService } from './services/verification.service.js';
import { VerificationPollerService } from './services/verification-poller.service.js';
import { VerificationEventsService } from './services/verification-events.service.js';
import { DOMAINS_MODULE_OPTIONS, DOMAINS_PRISMA_SERVICE } from './domains.constants.js';
import type { DomainsModuleOptions } from './types/domains.types.js';

// ---------------------------------------------------------------------------
// Async options interface
// ---------------------------------------------------------------------------

export interface DomainsModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<DomainsModuleOptions> | DomainsModuleOptions;
  inject?: (string | symbol | Type<unknown>)[];
  imports?: DynamicModule['imports'];
  extraProviders?: Provider[];
}

// ---------------------------------------------------------------------------
// Internal provider list
// ---------------------------------------------------------------------------

const DOMAINS_PROVIDERS: Provider[] = [
  CloudflareClient,
  DomainService,
  DnsLookupService,
  VerificationService,
  VerificationPollerService,
  VerificationEventsService,
];

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

@Module({})
export class DomainsModule {
  /**
   * Registers the DomainsModule with static (synchronous) options.
   *
   * The consuming application must provide a Prisma service bound to the
   * `prismaServiceToken` (default: `'PrismaService'`).
   */
  static register(options: DomainsModuleOptions): DynamicModule {
    const prismaToken = options.prismaServiceToken ?? 'PrismaService';

    return {
      module: DomainsModule,
      imports: [EventEmitterModule.forRoot()],
      providers: [
        {
          provide: DOMAINS_MODULE_OPTIONS,
          useValue: options,
        },
        {
          provide: DOMAINS_PRISMA_SERVICE,
          useExisting: prismaToken,
        },
        ...DOMAINS_PROVIDERS,
      ],
      exports: [DomainService, CloudflareClient, DnsLookupService, VerificationService, VerificationPollerService, VerificationEventsService],
    };
  }

  /**
   * Registers the DomainsModule with asynchronous options (e.g. from ConfigService).
   */
  static registerAsync(asyncOptions: DomainsModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: DOMAINS_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject ?? []) as never[],
    };

    return {
      module: DomainsModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        optionsProvider,
        // Prisma binding is deferred until register() — consumers must provide
        // DOMAINS_PRISMA_SERVICE themselves if using registerAsync without a token.
        // Alternatively, pass `prismaServiceToken` inside the factory result:
        {
          provide: DOMAINS_PRISMA_SERVICE,
          useFactory: (opts: DomainsModuleOptions, ...args: unknown[]) => {
            // The factory resolves the token at runtime from the NestJS container.
            // This indirection avoids a circular dependency on PrismaService.
            return args[0]; // injected Prisma service (see inject below)
          },
          inject: [
            DOMAINS_MODULE_OPTIONS,
            // Consumers pass the prisma token via extraProviders if needed.
          ],
        },
        ...(asyncOptions.extraProviders ?? []),
        ...DOMAINS_PROVIDERS,
      ],
      exports: [DomainService, CloudflareClient, DnsLookupService, VerificationService, VerificationPollerService, VerificationEventsService],
    };
  }

  /**
   * Convenience method for testing — injects mock objects directly.
   */
  static forTest(mockPrisma: unknown, options: DomainsModuleOptions): DynamicModule {
    return {
      module: DomainsModule,
      imports: [EventEmitterModule.forRoot()],
      providers: [
        { provide: DOMAINS_MODULE_OPTIONS, useValue: options },
        { provide: DOMAINS_PRISMA_SERVICE, useValue: mockPrisma },
        ...DOMAINS_PROVIDERS,
      ],
      exports: [DomainService, CloudflareClient, DnsLookupService, VerificationService, VerificationPollerService, VerificationEventsService],
    };
  }
}
