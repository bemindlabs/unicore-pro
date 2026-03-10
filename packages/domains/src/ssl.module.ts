/**
 * SslModule — NestJS dynamic module for @unicore/domains SSL provisioning.
 */

import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SslService, SSL_PRISMA } from './services/ssl.service.js';
import { SslMonitorService } from './services/ssl-monitor.service.js';
import { CloudflareSslClient } from './services/cloudflare-ssl.client.js';
import { SslController } from './controllers/ssl.controller.js';
import { SSL_MODULE_OPTIONS } from './ssl.constants.js';
import type { SslModuleOptions } from './types/ssl.types.js';

export interface SslModuleAsyncOptions {
  useFactory: (...args: unknown[]) => Promise<SslModuleOptions> | SslModuleOptions;
  inject?: (string | symbol | Type<unknown>)[];
  imports?: DynamicModule['imports'];
  extraProviders?: Provider[];
}

const SSL_PROVIDERS: Provider[] = [SslService, SslMonitorService, CloudflareSslClient, EventEmitter2];

@Module({})
export class SslModule {
  static register(options: SslModuleOptions, prismaProvider?: Provider): DynamicModule {
    return {
      module: SslModule,
      controllers: [SslController],
      providers: [
        { provide: SSL_MODULE_OPTIONS, useValue: options },
        prismaProvider ?? { provide: SSL_PRISMA, useValue: null },
        ...SSL_PROVIDERS,
      ],
      exports: [SslService, SslMonitorService, CloudflareSslClient],
    };
  }

  static registerAsync(asyncOptions: SslModuleAsyncOptions, prismaProvider?: Provider): DynamicModule {
    const optionsProvider: Provider = {
      provide: SSL_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject ?? []) as never[],
    };
    return {
      module: SslModule,
      imports: asyncOptions.imports ?? [],
      controllers: [SslController],
      providers: [
        optionsProvider,
        prismaProvider ?? { provide: SSL_PRISMA, useValue: null },
        ...(asyncOptions.extraProviders ?? []),
        ...SSL_PROVIDERS,
      ],
      exports: [SslService, SslMonitorService, CloudflareSslClient],
    };
  }
}
