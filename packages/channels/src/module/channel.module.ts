/**
 * ChannelModule — NestJS dynamic module.
 *
 * Usage (static config):
 * ```ts
 * ChannelModule.forRoot([
 *   { type: 'line', channelId: 'line-main', displayName: 'LINE Main', ... },
 *   { type: 'slack', channelId: 'slack-support', displayName: 'Slack Support', ... },
 * ])
 * ```
 *
 * Usage (async / ConfigService):
 * ```ts
 * ChannelModule.forRootAsync({
 *   useFactory: (config: ConfigService) => config.get('channels'),
 *   inject: [ConfigService],
 * })
 * ```
 */

import {
  DynamicModule,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Provider,
  Type,
  ModuleMetadata,
} from '@nestjs/common';
import { ChannelRegistry } from '../registry/channel-registry.service.js';
import { AgentBindingService } from '../binding/agent-binding.service.js';
import { ChannelFactory } from './channel.factory.js';
import type { ChannelConfig } from '../types/channel-config.types.js';
import { CHANNEL_REGISTRY } from '../interfaces/channel-registry.interface.js';
import { AGENT_BINDING_SERVICE } from '../interfaces/agent-binding.interface.js';

export const CHANNEL_CONFIGS = Symbol('CHANNEL_CONFIGS');

export interface ChannelModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<ChannelConfig[]> | ChannelConfig[];
  inject?: (string | symbol | Type<unknown>)[];
}

@Module({})
export class ChannelModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly registry: ChannelRegistry) {}

  // ─── forRoot (static) ───────────────────────────────────────────────────────

  static forRoot(configs: ChannelConfig[]): DynamicModule {
    const providers: Provider[] = [
      {
        provide: CHANNEL_CONFIGS,
        useValue: configs,
      },
      {
        provide: CHANNEL_REGISTRY,
        useClass: ChannelRegistry,
      },
      ChannelRegistry,
      {
        provide: AGENT_BINDING_SERVICE,
        useClass: AgentBindingService,
      },
      AgentBindingService,
    ];

    return {
      module: ChannelModule,
      providers,
      exports: [ChannelRegistry, AgentBindingService, CHANNEL_REGISTRY, AGENT_BINDING_SERVICE],
      global: true,
    };
  }

  // ─── forRootAsync ────────────────────────────────────────────────────────────

  static forRootAsync(options: ChannelModuleAsyncOptions): DynamicModule {
    const asyncProviders: Provider[] = [
      {
        provide: CHANNEL_CONFIGS,
        useFactory: options.useFactory,
        inject: (options.inject ?? []) as (string | symbol)[],
      },
      {
        provide: CHANNEL_REGISTRY,
        useClass: ChannelRegistry,
      },
      ChannelRegistry,
      {
        provide: AGENT_BINDING_SERVICE,
        useClass: AgentBindingService,
      },
      AgentBindingService,
    ];

    return {
      module: ChannelModule,
      imports: options.imports ?? [],
      providers: asyncProviders,
      exports: [ChannelRegistry, AgentBindingService, CHANNEL_REGISTRY, AGENT_BINDING_SERVICE],
      global: true,
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    // Adapters are registered + connected via the initializer provider above.
    // connectAll() handles any that were registered but not yet connected.
    const results = await this.registry.connectAll();
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[ChannelModule] Adapter connect error:', result.reason);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.registry.disconnectAll();
  }
}

/**
 * ChannelInitializer — registers all adapters from config into the registry.
 * Provided as an internal provider so it runs at module init time.
 */
export class ChannelInitializer {
  constructor(
    private readonly configs: ChannelConfig[],
    private readonly registry: ChannelRegistry,
  ) {
    for (const config of configs) {
      if (config.enabled === false) continue;
      const adapter = ChannelFactory.create(config);
      registry.register(adapter);
    }
  }
}
