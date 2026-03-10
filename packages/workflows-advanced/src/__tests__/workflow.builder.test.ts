import { WorkflowBuilder, WorkflowBuilderService } from '../builder/workflow.builder.js';

describe('WorkflowBuilder', () => {
  it('builds a minimal valid workflow', () => {
    const def = new WorkflowBuilder('Simple Test')
      .addTrigger(
        'trigger_start',
        'Start',
        { triggerType: 'manual' },
        'end_done',
      )
      .addEnd('end_done', 'Done', { outcome: 'success' })
      .build();

    expect(def.name).toBe('Simple Test');
    expect(def.entryNodeId).toBe('trigger_start');
    expect(Object.keys(def.nodes)).toHaveLength(2);
  });

  it('sets entry node from first trigger automatically', () => {
    const def = new WorkflowBuilder('Auto Entry')
      .addTrigger('t1', 'Trigger', { triggerType: 'manual' }, 'end')
      .addEnd('end', 'End')
      .build();

    expect(def.entryNodeId).toBe('t1');
  });

  it('supports description, tags, and settings', () => {
    const def = new WorkflowBuilder('Full Featured')
      .description('A fully configured workflow')
      .tags('test', 'demo')
      .settings({ persistHistory: true, maxConcurrentExecutions: 10 })
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .build();

    expect(def.description).toBe('A fully configured workflow');
    expect(def.tags).toContain('test');
    expect(def.settings?.persistHistory).toBe(true);
  });

  it('adds action nodes', () => {
    const def = new WorkflowBuilder('With Action')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'act')
      .addAction('act', 'My Action', {
        actionType: 'send_email',
        to: 'test@example.com',
        subject: 'Test',
        bodyTemplate: 'Hello',
      }, { nextNodeId: 'end' })
      .addEnd('end', 'End')
      .build();

    expect(def.nodes['act']).toBeDefined();
    expect(def.nodes['act'].type).toBe('action');
  });

  it('adds condition nodes', () => {
    const def = new WorkflowBuilder('With Condition')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'cond')
      .addCondition('cond', 'Check', {
        branches: [
          {
            condition: { type: 'leaf', field: '$.score', operator: 'gte', value: 80 },
            nextNodeId: 'end_pass',
          },
        ],
        defaultNextNodeId: 'end_fail',
      })
      .addEnd('end_pass', 'Pass', { outcome: 'success' })
      .addEnd('end_fail', 'Fail', { outcome: 'failure' })
      .build();

    expect(def.nodes['cond'].type).toBe('condition');
  });

  it('adds loop nodes', () => {
    const def = new WorkflowBuilder('With Loop')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'loop')
      .addLoop(
        'loop',
        'My Loop',
        { loopType: 'count', count: 5 },
        'action_body',
        { nextNodeId: 'end' },
      )
      .addAction('action_body', 'Body', {
        actionType: 'send_notification',
        channel: 'in_app',
        title: 'Iter',
        messageTemplate: 'Step {{i}}',
      })
      .addEnd('end', 'End')
      .build();

    expect(def.nodes['loop'].type).toBe('loop');
  });

  it('throws on duplicate node ids', () => {
    const builder = new WorkflowBuilder('Dup Test')
      .addEnd('end', 'End 1');
    expect(() => builder.addEnd('end', 'End 2')).toThrow('already exists');
  });

  it('throws on invalid workflow when validate=true', () => {
    const builder = new WorkflowBuilder('Invalid')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'missing_node')
      .addEnd('end', 'End');

    expect(() => builder.build(true)).toThrow();
  });

  it('exports to JSON string', () => {
    const json = new WorkflowBuilder('JSON Test')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .toJson();

    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('JSON Test');
  });

  it('exports to YAML string', () => {
    const yamlStr = new WorkflowBuilder('YAML Test')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .toYaml();

    expect(yamlStr).toContain('name: YAML Test');
  });
});

describe('WorkflowBuilderService', () => {
  const service = new WorkflowBuilderService();

  it('creates a new builder', () => {
    const builder = service.create('Service Test');
    expect(builder).toBeInstanceOf(WorkflowBuilder);
  });

  it('parses workflow from JSON', () => {
    const json = new WorkflowBuilder('Parse JSON')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .toJson();

    const def = service.fromJson(json);
    expect(def.name).toBe('Parse JSON');
  });

  it('parses workflow from YAML', () => {
    const yamlStr = new WorkflowBuilder('Parse YAML')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .toYaml();

    const def = service.fromYaml(yamlStr);
    expect(def.name).toBe('Parse YAML');
  });

  it('clones a workflow with new id and name', () => {
    const original = new WorkflowBuilder('Original')
      .addTrigger('t', 'T', { triggerType: 'manual' }, 'e')
      .addEnd('e', 'E')
      .build(false);

    const clone = service.clone(original, 'Cloned');
    expect(clone.name).toBe('Cloned');
    expect(clone.id).not.toBe(original.id);
    expect(clone.status).toBe('draft');
  });
});
