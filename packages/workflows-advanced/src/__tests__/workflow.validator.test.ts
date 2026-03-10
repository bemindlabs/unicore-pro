import { WorkflowValidator } from '../validator/workflow.validator.js';
import type { WorkflowDefinition } from '../types/index.js';

const buildMinimalWorkflow = (): WorkflowDefinition => ({
  schemaVersion: '1.0.0',
  id: 'wf_test',
  name: 'Test Workflow',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entryNodeId: 'trigger_start',
  nodes: {
    trigger_start: {
      id: 'trigger_start',
      name: 'Start',
      type: 'trigger',
      triggerConfig: { triggerType: 'manual' },
      nextNodeId: 'end_done',
    },
    end_done: {
      id: 'end_done',
      name: 'Done',
      type: 'end',
      outcome: 'success',
    },
  },
});

describe('WorkflowValidator', () => {
  const validator = new WorkflowValidator();

  it('validates a minimal valid workflow', () => {
    const result = validator.validate(buildMinimalWorkflow());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when id is missing', () => {
    const def = buildMinimalWorkflow();
    def.id = '';
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'id')).toBe(true);
  });

  it('errors when name is missing', () => {
    const def = buildMinimalWorkflow();
    def.name = '';
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
  });

  it('errors when entry node does not exist', () => {
    const def = buildMinimalWorkflow();
    def.entryNodeId = 'nonexistent';
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'entryNodeId')).toBe(true);
  });

  it('errors when entry node is not a trigger', () => {
    const def = buildMinimalWorkflow();
    def.entryNodeId = 'end_done';
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
  });

  it('errors when trigger nextNodeId is missing in nodes', () => {
    const def = buildMinimalWorkflow();
    (def.nodes['trigger_start'] as { nextNodeId: string }).nextNodeId = 'ghost_node';
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
  });

  it('warns about unreachable nodes', () => {
    const def = buildMinimalWorkflow();
    def.nodes['orphan'] = {
      id: 'orphan',
      name: 'Orphan',
      type: 'end',
      outcome: 'unreachable',
    };
    const result = validator.validate(def);
    // Should still be valid (it is a warning)
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path === 'nodes.orphan')).toBe(true);
  });

  it('validates condition node with branches', () => {
    const def = buildMinimalWorkflow();
    def.nodes['trigger_start'] = {
      id: 'trigger_start',
      name: 'Start',
      type: 'trigger',
      triggerConfig: { triggerType: 'manual' },
      nextNodeId: 'condition_check',
    };
    def.nodes['condition_check'] = {
      id: 'condition_check',
      name: 'Check',
      type: 'condition',
      conditionConfig: {
        branches: [
          {
            condition: { type: 'leaf', field: '$.score', operator: 'gte', value: 50 },
            nextNodeId: 'end_done',
          },
        ],
        defaultNextNodeId: 'end_done',
      },
    };
    const result = validator.validate(def);
    expect(result.valid).toBe(true);
  });

  it('errors when condition branch references missing node', () => {
    const def = buildMinimalWorkflow();
    def.nodes['trigger_start'] = {
      id: 'trigger_start',
      name: 'Start',
      type: 'trigger',
      triggerConfig: { triggerType: 'manual' },
      nextNodeId: 'condition_check',
    };
    def.nodes['condition_check'] = {
      id: 'condition_check',
      name: 'Check',
      type: 'condition',
      conditionConfig: {
        branches: [
          {
            condition: { type: 'leaf', field: '$.score', operator: 'gte', value: 50 },
            nextNodeId: 'missing_node',
          },
        ],
      },
    };
    const result = validator.validate(def);
    expect(result.valid).toBe(false);
  });

  it('validates loop node', () => {
    const def = buildMinimalWorkflow();
    def.nodes['trigger_start'] = {
      id: 'trigger_start',
      name: 'Start',
      type: 'trigger',
      triggerConfig: { triggerType: 'manual' },
      nextNodeId: 'loop_items',
    };
    def.nodes['loop_items'] = {
      id: 'loop_items',
      name: 'Loop Items',
      type: 'loop',
      loopConfig: { loopType: 'count', count: 3, indexVariable: 'i' },
      bodyNodeId: 'end_done',
      nextNodeId: 'end_done',
    };
    const result = validator.validate(def);
    expect(result.valid).toBe(true);
  });

  it('validates parallel node', () => {
    const def = buildMinimalWorkflow();
    def.nodes['trigger_start'] = {
      id: 'trigger_start',
      name: 'Start',
      type: 'trigger',
      triggerConfig: { triggerType: 'manual' },
      nextNodeId: 'par_node',
    };
    def.nodes['par_node'] = {
      id: 'par_node',
      name: 'Parallel',
      type: 'parallel',
      parallelConfig: { waitStrategy: 'all' },
      branches: [
        { id: 'b1', name: 'B1', entryNodeId: 'end_done' },
        { id: 'b2', name: 'B2', entryNodeId: 'end_done' },
      ],
      nextNodeId: 'end_done',
    };
    const result = validator.validate(def);
    expect(result.valid).toBe(true);
  });
});
