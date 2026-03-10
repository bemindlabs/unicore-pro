import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  BuilderWizardSession,
  WizardStepBasic,
  WizardStepPrompt,
  WizardStepTools,
  WizardStepConfig,
  WizardStepTest,
  WizardStepDeploy,
  AgentModelConfig,
  AgentTool,
} from '../types/agent.types';
import { AgentStorageService, CreateAgentDto } from './agent-storage.service';
import { ToolRegistryService } from './tool-registry.service';
import { PromptEditorService } from './prompt-editor.service';
import { AgentSimulatorService } from './agent-simulator.service';

const DEFAULT_MODEL_CONFIG: AgentModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
};

/**
 * Orchestrates the 6-step builder wizard that guides users through creating
 * a custom agent:
 *
 *   1. Basic identity (name, description, tags)
 *   2. System prompt authoring
 *   3. Tool selection
 *   4. Model / runtime configuration
 *   5. Testing via the simulator
 *   6. Deployment confirmation
 */
@Injectable()
export class BuilderWizardService {
  private readonly sessions = new Map<string, BuilderWizardSession>();

  constructor(
    private readonly storage: AgentStorageService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly promptEditor: PromptEditorService,
    private readonly simulator: AgentSimulatorService,
  ) {}

  // ── Session lifecycle ─────────────────────────────────────────────────────

  createSession(): BuilderWizardSession {
    const now = new Date();
    const session: BuilderWizardSession = {
      sessionId: uuidv4(),
      currentStep: 1,
      steps: {
        1: { step: 1, name: '', description: '', tags: [], status: 'active' },
        2: { step: 2, systemPrompt: '', variables: [], previewContext: {}, status: 'pending' },
        3: { step: 3, selectedToolIds: [], status: 'pending' },
        4: { step: 4, modelConfig: { ...DEFAULT_MODEL_CONFIG }, status: 'pending' },
        5: { step: 5, testMessages: [], status: 'pending' },
        6: { step: 6, targetEnvironment: 'sandbox', confirmDeploy: false, status: 'pending' },
      },
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.sessionId, session);
    return this.copySession(session);
  }

  getSession(sessionId: string): BuilderWizardSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Wizard session "${sessionId}" not found.`);
    }
    return this.copySession(session);
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ── Step 1 — Basic identity ───────────────────────────────────────────────

  saveStep1(
    sessionId: string,
    data: Pick<WizardStepBasic, 'name' | 'description' | 'tags'>,
  ): BuilderWizardSession {
    const session = this.requireSession(sessionId);

    if (!data.name.trim()) {
      throw new BadRequestException('Agent name is required.');
    }

    session.steps[1] = { ...session.steps[1], ...data, status: 'completed' };
    session.steps[2] = { ...session.steps[2], status: 'active' };
    session.currentStep = 2;
    session.updatedAt = new Date();

    return this.copySession(session);
  }

  // ── Step 2 — Prompt ───────────────────────────────────────────────────────

  saveStep2(
    sessionId: string,
    data: Pick<WizardStepPrompt, 'systemPrompt' | 'previewContext'>,
  ): BuilderWizardSession {
    const session = this.requireSession(sessionId);

    const validation = this.promptEditor.validate(data.systemPrompt);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'System prompt is invalid.',
        errors: validation.errors,
      });
    }

    const variables = this.promptEditor.extractVariables(data.systemPrompt);

    session.steps[2] = {
      ...session.steps[2],
      systemPrompt: data.systemPrompt,
      variables,
      previewContext: data.previewContext,
      status: 'completed',
    };
    session.steps[3] = { ...session.steps[3], status: 'active' };
    session.currentStep = 3;
    session.updatedAt = new Date();

    return this.copySession(session);
  }

  // ── Step 3 — Tools ────────────────────────────────────────────────────────

  saveStep3(
    sessionId: string,
    data: Pick<WizardStepTools, 'selectedToolIds'>,
  ): BuilderWizardSession {
    const session = this.requireSession(sessionId);

    // Validate all tool IDs exist in registry
    for (const id of data.selectedToolIds) {
      if (!this.toolRegistry.has(id)) {
        throw new BadRequestException(`Tool "${id}" is not registered.`);
      }
    }

    session.steps[3] = { ...session.steps[3], ...data, status: 'completed' };
    session.steps[4] = { ...session.steps[4], status: 'active' };
    session.currentStep = 4;
    session.updatedAt = new Date();

    return this.copySession(session);
  }

  // ── Step 4 — Config ───────────────────────────────────────────────────────

  saveStep4(
    sessionId: string,
    data: Pick<WizardStepConfig, 'modelConfig'>,
  ): BuilderWizardSession {
    const session = this.requireSession(sessionId);

    if (data.modelConfig.temperature < 0 || data.modelConfig.temperature > 2) {
      throw new BadRequestException('Temperature must be between 0 and 2.');
    }
    if (data.modelConfig.maxTokens < 1 || data.modelConfig.maxTokens > 128_000) {
      throw new BadRequestException('maxTokens must be between 1 and 128000.');
    }

    session.steps[4] = { ...session.steps[4], modelConfig: data.modelConfig, status: 'completed' };
    session.steps[5] = { ...session.steps[5], status: 'active' };
    session.currentStep = 5;
    session.updatedAt = new Date();

    return this.copySession(session);
  }

  // ── Step 5 — Test ─────────────────────────────────────────────────────────

  async runTest(
    sessionId: string,
    testMessages: WizardStepTest['testMessages'],
  ): Promise<BuilderWizardSession> {
    const session = this.requireSession(sessionId);

    // Persist a temporary agent to simulate against
    const tools = this.resolveTools(session.steps[3].selectedToolIds);
    const tempDto: CreateAgentDto = {
      name: session.steps[1].name || 'Unnamed (test)',
      description: session.steps[1].description,
      systemPrompt: session.steps[2].systemPrompt || 'You are a helpful assistant.',
      tools,
      modelConfig: session.steps[4].modelConfig,
      tags: session.steps[1].tags,
      createdBy: 'wizard-test',
    };

    // Re-use existing agent if already created, otherwise create a temp one
    let agentId = session.agentId;
    if (!agentId) {
      const agent = await this.storage.create(tempDto);
      agentId = agent.id;
      session.agentId = agentId;
    }

    const result = await this.simulator.simulate({
      agentId,
      messages: testMessages.map((m) => ({ role: m.role, content: m.content })),
      promptVariables: session.steps[2].previewContext,
    });

    session.steps[5] = {
      ...session.steps[5],
      testMessages,
      simulationResult: result,
      status: result.success ? 'completed' : 'error',
    };

    if (result.success) {
      session.steps[6] = { ...session.steps[6], status: 'active' };
      session.currentStep = 6;
    }

    session.updatedAt = new Date();
    return this.copySession(session);
  }

  // ── Step 6 — Deploy ───────────────────────────────────────────────────────

  async deploy(
    sessionId: string,
    data: Pick<WizardStepDeploy, 'targetEnvironment' | 'confirmDeploy'>,
    deployedBy: string,
  ): Promise<{ session: BuilderWizardSession; agentId: string }> {
    const session = this.requireSession(sessionId);

    if (!data.confirmDeploy) {
      throw new BadRequestException('Deployment must be explicitly confirmed.');
    }

    const tools = this.resolveTools(session.steps[3].selectedToolIds);

    let agentId = session.agentId;

    if (!agentId) {
      // Create brand-new agent from wizard data
      const created = await this.storage.create({
        name: session.steps[1].name,
        description: session.steps[1].description,
        systemPrompt: session.steps[2].systemPrompt,
        tools,
        modelConfig: session.steps[4].modelConfig,
        tags: session.steps[1].tags,
        createdBy: deployedBy,
      });
      agentId = created.id;
      session.agentId = agentId;
    }

    // Activate the agent
    await this.storage.activate(agentId, deployedBy);

    session.steps[6] = {
      ...session.steps[6],
      ...data,
      status: 'completed',
    };
    session.updatedAt = new Date();

    return { session: this.copySession(session), agentId };
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goToStep(
    sessionId: string,
    step: 1 | 2 | 3 | 4 | 5 | 6,
  ): BuilderWizardSession {
    const session = this.requireSession(sessionId);
    session.currentStep = step;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session.steps as any)[step] = { ...(session.steps as any)[step], status: 'active' };
    session.updatedAt = new Date();
    return this.copySession(session);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private requireSession(sessionId: string): BuilderWizardSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Wizard session "${sessionId}" not found.`);
    }
    return session;
  }

  private resolveTools(toolIds: string[]): AgentTool[] {
    return this.toolRegistry
      .getAvailableForAgent(toolIds)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        available: t.available,
      }));
  }

  private copySession(session: BuilderWizardSession): BuilderWizardSession {
    return JSON.parse(JSON.stringify(session)) as BuilderWizardSession;
  }
}
