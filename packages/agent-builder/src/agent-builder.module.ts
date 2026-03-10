import { DynamicModule, Module } from '@nestjs/common';
import { AgentStorageService } from './services/agent-storage.service';
import { ToolRegistryService } from './services/tool-registry.service';
import { PromptEditorService } from './services/prompt-editor.service';
import { AgentSimulatorService } from './services/agent-simulator.service';
import { BuilderWizardService } from './services/builder-wizard.service';

export interface AgentBuilderModuleOptions {
  /** Override the default model provider used in the wizard. */
  defaultModelProvider?: string;
  /** Extra tools to pre-register at module init time. */
  extraTools?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    version: string;
    requiredTier: 'community' | 'pro' | 'enterprise';
    available: boolean;
    parameters: Record<string, unknown>;
  }>;
}

export const AGENT_BUILDER_OPTIONS = 'AGENT_BUILDER_OPTIONS';

/**
 * NestJS dynamic module for the custom agent builder subsystem.
 *
 * Usage (eager / static):
 *   AgentBuilderModule.register()
 *
 * Usage (with options):
 *   AgentBuilderModule.register({ defaultModelProvider: 'anthropic' })
 */
@Module({})
export class AgentBuilderModule {
  static register(
    options: AgentBuilderModuleOptions = {},
  ): DynamicModule {
    return {
      module: AgentBuilderModule,
      providers: [
        {
          provide: AGENT_BUILDER_OPTIONS,
          useValue: options,
        },
        AgentStorageService,
        ToolRegistryService,
        PromptEditorService,
        AgentSimulatorService,
        BuilderWizardService,
      ],
      exports: [
        AgentStorageService,
        ToolRegistryService,
        PromptEditorService,
        AgentSimulatorService,
        BuilderWizardService,
      ],
    };
  }

  /** Convenience shorthand for modules that do not need custom options. */
  static forRoot(): DynamicModule {
    return AgentBuilderModule.register();
  }
}
