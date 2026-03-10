import { AgentStorageService } from '../services/agent-storage.service';
import { ToolRegistryService } from '../services/tool-registry.service';
import { PromptEditorService } from '../services/prompt-editor.service';
import { AgentSimulatorService } from '../services/agent-simulator.service';
import { BuilderWizardService } from '../services/builder-wizard.service';
import { AgentModelConfig } from '../types/agent.types';

const modelConfig: AgentModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
};

function buildWizardService() {
  const storage = new AgentStorageService();
  const toolRegistry = new ToolRegistryService();
  const promptEditor = new PromptEditorService();
  const simulator = new AgentSimulatorService(storage, toolRegistry, promptEditor);
  const wizard = new BuilderWizardService(storage, toolRegistry, promptEditor, simulator);
  return { storage, toolRegistry, wizard };
}

describe('BuilderWizardService', () => {
  describe('createSession()', () => {
    it('should create a session at step 1', () => {
      const { wizard } = buildWizardService();
      const session = wizard.createSession();

      expect(session.sessionId).toBeTruthy();
      expect(session.currentStep).toBe(1);
      expect(session.steps[1].status).toBe('active');
    });
  });

  describe('getSession()', () => {
    it('should return existing session', () => {
      const { wizard } = buildWizardService();
      const created = wizard.createSession();
      const fetched = wizard.getSession(created.sessionId);
      expect(fetched.sessionId).toBe(created.sessionId);
    });

    it('should throw NotFoundException for unknown session', () => {
      const { wizard } = buildWizardService();
      expect(() => wizard.getSession('ghost')).toThrow('not found');
    });
  });

  describe('saveStep1()', () => {
    it('should advance to step 2 after saving basic info', () => {
      const { wizard } = buildWizardService();
      const session = wizard.createSession();

      const updated = wizard.saveStep1(session.sessionId, {
        name: 'My Agent',
        description: 'Does cool things',
        tags: ['crm'],
      });

      expect(updated.currentStep).toBe(2);
      expect(updated.steps[1].status).toBe('completed');
      expect(updated.steps[2].status).toBe('active');
    });

    it('should throw when name is empty', () => {
      const { wizard } = buildWizardService();
      const session = wizard.createSession();
      expect(() =>
        wizard.saveStep1(session.sessionId, { name: '', description: '', tags: [] }),
      ).toThrow('name is required');
    });
  });

  describe('saveStep2()', () => {
    function setupAfterStep1(wizard: BuilderWizardService) {
      const s = wizard.createSession();
      return wizard.saveStep1(s.sessionId, { name: 'Agent', description: '', tags: [] });
    }

    it('should advance to step 3 after valid prompt', () => {
      const { wizard } = buildWizardService();
      const s1 = setupAfterStep1(wizard);

      const updated = wizard.saveStep2(s1.sessionId, {
        systemPrompt: 'You are a helpful assistant for {{ company }}.',
        previewContext: { company: 'Acme' },
      });

      expect(updated.currentStep).toBe(3);
      expect(updated.steps[2].variables).toContain('company');
    });

    it('should throw on invalid prompt', () => {
      const { wizard } = buildWizardService();
      const s1 = setupAfterStep1(wizard);
      expect(() =>
        wizard.saveStep2(s1.sessionId, { systemPrompt: '', previewContext: {} }),
      ).toThrow();
    });
  });

  describe('saveStep3()', () => {
    function setupAfterStep2(wizard: BuilderWizardService) {
      const s = wizard.createSession();
      const s1 = wizard.saveStep1(s.sessionId, { name: 'Agent', description: '', tags: [] });
      return wizard.saveStep2(s1.sessionId, {
        systemPrompt: 'You are a helpful assistant. Always respond politely.',
        previewContext: {},
      });
    }

    it('should accept valid tool ids and advance to step 4', () => {
      const { wizard } = buildWizardService();
      const s2 = setupAfterStep2(wizard);

      const updated = wizard.saveStep3(s2.sessionId, {
        selectedToolIds: ['web_search'],
      });

      expect(updated.currentStep).toBe(4);
      expect(updated.steps[3].selectedToolIds).toContain('web_search');
    });

    it('should throw for unknown tool id', () => {
      const { wizard } = buildWizardService();
      const s2 = setupAfterStep2(wizard);
      expect(() =>
        wizard.saveStep3(s2.sessionId, { selectedToolIds: ['ghost_tool'] }),
      ).toThrow();
    });
  });

  describe('saveStep4()', () => {
    it('should throw for temperature out of range', () => {
      const { wizard } = buildWizardService();
      const s = wizard.createSession();
      wizard.saveStep1(s.sessionId, { name: 'A', description: '', tags: [] });
      wizard.saveStep2(s.sessionId, {
        systemPrompt: 'You are a helpful assistant. Always respond.',
        previewContext: {},
      });
      wizard.saveStep3(s.sessionId, { selectedToolIds: [] });

      expect(() =>
        wizard.saveStep4(s.sessionId, {
          modelConfig: { ...modelConfig, temperature: 5 },
        }),
      ).toThrow('Temperature');
    });
  });

  describe('full wizard flow — runTest + deploy', () => {
    it('should deploy an agent after completing all steps', async () => {
      const { wizard } = buildWizardService();

      const s = wizard.createSession();
      wizard.saveStep1(s.sessionId, { name: 'Full Flow Agent', description: 'test', tags: [] });
      wizard.saveStep2(s.sessionId, {
        systemPrompt: 'You are a helpful assistant. Always respond politely.',
        previewContext: {},
      });
      wizard.saveStep3(s.sessionId, { selectedToolIds: ['web_search'] });
      wizard.saveStep4(s.sessionId, { modelConfig });

      const afterTest = await wizard.runTest(s.sessionId, [
        { id: 'msg1', role: 'user', content: 'Hello!', createdAt: new Date() },
      ]);

      expect(afterTest.steps[5].simulationResult?.success).toBe(true);

      const { session, agentId } = await wizard.deploy(
        s.sessionId,
        { targetEnvironment: 'production', confirmDeploy: true },
        'deployer-1',
      );

      expect(session.steps[6].status).toBe('completed');
      expect(agentId).toBeTruthy();
    });

    it('should throw on deploy without confirmation', async () => {
      const { wizard } = buildWizardService();
      const s = wizard.createSession();
      wizard.saveStep1(s.sessionId, { name: 'A', description: '', tags: [] });
      wizard.saveStep2(s.sessionId, {
        systemPrompt: 'You are a helpful assistant. Always respond.',
        previewContext: {},
      });
      wizard.saveStep3(s.sessionId, { selectedToolIds: [] });
      wizard.saveStep4(s.sessionId, { modelConfig });

      await expect(
        wizard.deploy(
          s.sessionId,
          { targetEnvironment: 'sandbox', confirmDeploy: false },
          'deployer-1',
        ),
      ).rejects.toThrow('confirmed');
    });
  });
});
