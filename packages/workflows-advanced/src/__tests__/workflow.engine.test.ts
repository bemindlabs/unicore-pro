import { WorkflowEngine } from '../engine/workflow.engine.js';
import { InMemoryPersistenceAdapter } from '../engine/in-memory.persistence.js';
import { WorkflowBuilder } from '../builder/workflow.builder.js';
import type { ActionHandler, NodeResult } from '../engine/node.executor.js';
import type { ActionNode, WorkflowContext } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSimpleWorkflow() {
  return new WorkflowBuilder('Simple Engine Test')
    .addTrigger('trigger', 'Trigger', { triggerType: 'manual' }, 'action_greet')
    .addAction(
      'action_greet',
      'Greet',
      { actionType: 'send_email', to: 'user@example.com', subject: 'Hi', bodyTemplate: 'Hello' },
      { nextNodeId: 'end' },
    )
    .addEnd('end', 'End', { outcome: 'success' })
    .build(false);
}

function buildConditionalWorkflow() {
  return new WorkflowBuilder('Conditional Engine Test')
    .addTrigger('trigger', 'Trigger', { triggerType: 'manual' }, 'condition_score')
    .addCondition('condition_score', 'Check Score', {
      branches: [
        {
          condition: { type: 'leaf', field: '$.score', operator: 'gte', value: 75 },
          nextNodeId: 'end_pass',
        },
      ],
      defaultNextNodeId: 'end_fail',
    })
    .addEnd('end_pass', 'Pass', { outcome: 'success' })
    .addEnd('end_fail', 'Fail', { outcome: 'failure' })
    .build(false);
}

// ---------------------------------------------------------------------------
// Mock action handler
// ---------------------------------------------------------------------------

const noopEmailHandler: ActionHandler = {
  actionType: 'send_email',
  execute: async (_node: ActionNode, _ctx: WorkflowContext): Promise<WorkflowContext> => {
    return { emailSent: true };
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEngine', () => {
  describe('basic execution', () => {
    it('executes a simple trigger -> action -> end workflow', async () => {
      const persistence = new InMemoryPersistenceAdapter();
      const engine = new WorkflowEngine({ persistence });
      engine.registerActionHandler(noopEmailHandler);

      const definition = buildSimpleWorkflow();
      const execution = await engine.execute(definition, {
        initialContext: { userId: 'u1' },
      });

      expect(execution.status).toBe('succeeded');
      expect(execution.nodeHistory.length).toBeGreaterThan(0);
      expect(execution.nodeHistory.some((n) => n.nodeId === 'trigger')).toBe(true);
    });

    it('persists execution to adapter', async () => {
      const persistence = new InMemoryPersistenceAdapter();
      const engine = new WorkflowEngine({ persistence });
      engine.registerActionHandler(noopEmailHandler);

      const definition = buildSimpleWorkflow();
      const execution = await engine.execute(definition);

      const stored = await persistence.getExecution(execution.id);
      expect(stored).not.toBeNull();
      expect(stored?.workflowId).toBe(definition.id);
    });

    it('emits events', async () => {
      const events: string[] = [];
      const engine = new WorkflowEngine();
      engine.registerActionHandler(noopEmailHandler);
      engine.onEvent((e) => { events.push(e.type); });

      const definition = buildSimpleWorkflow();
      await engine.execute(definition);

      expect(events).toContain('execution.started');
      expect(events).toContain('execution.completed');
      expect(events).toContain('node.started');
      expect(events).toContain('node.completed');
    });
  });

  describe('conditional routing', () => {
    it('routes to pass branch when score >= 75', async () => {
      const engine = new WorkflowEngine();
      const definition = buildConditionalWorkflow();

      const execution = await engine.execute(definition, {
        initialContext: { score: 80 },
      });

      expect(execution.status).toBe('succeeded');
      const endNode = execution.nodeHistory.find((n) => n.nodeId === 'end_pass');
      expect(endNode).toBeDefined();
    });

    it('routes to fail branch when score < 75', async () => {
      const engine = new WorkflowEngine();
      const definition = buildConditionalWorkflow();

      const execution = await engine.execute(definition, {
        initialContext: { score: 50 },
      });

      expect(execution.status).toBe('succeeded');
      const endNode = execution.nodeHistory.find((n) => n.nodeId === 'end_fail');
      expect(endNode).toBeDefined();
    });
  });

  describe('dry run', () => {
    it('succeeds in dry run mode without calling action handlers', async () => {
      let handlerCalled = false;
      const trackingHandler: ActionHandler = {
        actionType: 'send_email',
        execute: async () => {
          handlerCalled = true;
          return {};
        },
      };

      const engine = new WorkflowEngine();
      engine.registerActionHandler(trackingHandler);

      const definition = buildSimpleWorkflow();
      const execution = await engine.execute(definition, { dryRun: true });

      expect(execution.status).toBe('succeeded');
      // Dry run should not invoke real side effects
      expect(handlerCalled).toBe(false);
    });
  });

  describe('InMemoryPersistenceAdapter', () => {
    it('lists executions by workflow id', async () => {
      const adapter = new InMemoryPersistenceAdapter();
      const engine = new WorkflowEngine({ persistence: adapter });
      engine.registerActionHandler(noopEmailHandler);

      const def = buildSimpleWorkflow();
      await engine.execute(def);
      await engine.execute(def);

      const list = await adapter.listExecutions(def.id);
      expect(list.length).toBe(2);
    });

    it('filters executions by status', async () => {
      const adapter = new InMemoryPersistenceAdapter();
      const engine = new WorkflowEngine({ persistence: adapter });
      engine.registerActionHandler(noopEmailHandler);

      const def = buildSimpleWorkflow();
      await engine.execute(def);

      const succeeded = await adapter.listExecutions(def.id, { status: 'succeeded' });
      expect(succeeded.length).toBeGreaterThan(0);

      const failed = await adapter.listExecutions(def.id, { status: 'failed' });
      expect(failed.length).toBe(0);
    });

    it('purges old history', async () => {
      const adapter = new InMemoryPersistenceAdapter();
      const engine = new WorkflowEngine({ persistence: adapter });
      engine.registerActionHandler(noopEmailHandler);

      const def = buildSimpleWorkflow();
      await engine.execute(def);

      const future = new Date(Date.now() + 1_000_000);
      const purged = await adapter.purgeHistory(def.id, future);
      expect(purged).toBeGreaterThan(0);

      const remaining = await adapter.listExecutions(def.id);
      expect(remaining).toHaveLength(0);
    });
  });
});
