import { AgentStorageService } from '../services/agent-storage.service';
import { ToolRegistryService } from '../services/tool-registry.service';
import { PromptEditorService } from '../services/prompt-editor.service';
import { AgentSimulatorService } from '../services/agent-simulator.service';
import { AgentModelConfig } from '../types/agent.types';

const modelConfig: AgentModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
};

async function buildServices() {
  const storage = new AgentStorageService();
  const toolRegistry = new ToolRegistryService();
  const promptEditor = new PromptEditorService();
  const simulator = new AgentSimulatorService(storage, toolRegistry, promptEditor);

  const agent = await storage.create({
    name: 'Sim Test Agent',
    description: 'Agent for simulator tests',
    systemPrompt: 'You are a helpful assistant. Always be polite.',
    modelConfig,
    tools: [toolRegistry.getById('web_search')],
    createdBy: 'tester',
  });

  return { storage, toolRegistry, promptEditor, simulator, agent };
}

describe('AgentSimulatorService', () => {
  describe('simulate()', () => {
    it('should return a successful simulation result', async () => {
      const { simulator, agent } = await buildServices();

      const result = await simulator.simulate({
        agentId: agent.id,
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
      });

      expect(result.success).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should include a system message first', async () => {
      const { simulator, agent } = await buildServices();
      const result = await simulator.simulate({
        agentId: agent.id,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.messages[0].role).toBe('system');
    });

    it('should simulate a tool call when message implies tool use', async () => {
      const { simulator, agent } = await buildServices();
      const result = await simulator.simulate({
        agentId: agent.id,
        messages: [{ role: 'user', content: 'search for the latest AI news' }],
      });

      expect(result.toolCallsCount).toBeGreaterThan(0);
      const toolMsg = result.messages.find((m) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
    });

    it('should apply prompt variable substitution', async () => {
      const { storage, simulator } = await buildServices();
      const agentWithVar = await storage.create({
        name: 'Variable Agent',
        description: 'test',
        systemPrompt: 'You are working for {{ company }}.',
        modelConfig,
        createdBy: 'tester',
      });

      const result = await simulator.simulate({
        agentId: agentWithVar.id,
        messages: [{ role: 'user', content: 'Hello' }],
        promptVariables: { company: 'Acme Corp' },
      });

      const sysMsg = result.messages.find((m) => m.role === 'system');
      expect(sysMsg?.content).toContain('Acme Corp');
    });

    it('should throw NotFoundException for unknown agent', async () => {
      const { simulator } = await buildServices();
      await expect(
        simulator.simulate({ agentId: 'ghost', messages: [] }),
      ).rejects.toThrow('not found');
    });
  });

  describe('createSession() / addTurn()', () => {
    it('should create a session with a system message', async () => {
      const { simulator, agent } = await buildServices();
      const session = await simulator.createSession(agent.id);

      expect(session.sessionId).toBeTruthy();
      expect(session.messages[0].role).toBe('system');
    });

    it('should add turns to an existing session', async () => {
      const { simulator, agent } = await buildServices();
      const session = await simulator.createSession(agent.id);

      const added = await simulator.addTurn(session.sessionId, 'Hello!');
      expect(added.some((m) => m.role === 'assistant')).toBe(true);
    });

    it('should throw NotFoundException for unknown session', async () => {
      const { simulator } = await buildServices();
      await expect(
        simulator.addTurn('ghost-session', 'hi'),
      ).rejects.toThrow('not found');
    });

    it('should accumulate messages across turns', async () => {
      const { simulator, agent } = await buildServices();
      const session = await simulator.createSession(agent.id);

      await simulator.addTurn(session.sessionId, 'First message');
      await simulator.addTurn(session.sessionId, 'Second message');

      const current = simulator.getSession(session.sessionId);
      // system + (user + assistant) * 2 = 5 minimum
      expect(current.messages.length).toBeGreaterThanOrEqual(5);
    });
  });
});
