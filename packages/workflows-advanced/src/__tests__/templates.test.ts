import { WORKFLOW_TEMPLATES, getTemplate } from '../templates/index.js';
import { WorkflowValidator } from '../validator/workflow.validator.js';

describe('Workflow Templates', () => {
  const validator = new WorkflowValidator();

  it('exports 6 templates', () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(6);
  });

  it('all templates have unique ids', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all templates pass validation', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const result = validator.validate(template);
      if (!result.valid) {
        console.error(
          `Template "${template.id}" failed validation:`,
          result.errors,
        );
      }
      expect(result.valid).toBe(true);
    }
  });

  it('all templates have at least one trigger node', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const hasTrigger = Object.values(template.nodes).some((n) => n.type === 'trigger');
      expect(hasTrigger).toBe(true);
    }
  });

  it('all templates have at least one end node', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const hasEnd = Object.values(template.nodes).some((n) => n.type === 'end');
      expect(hasEnd).toBe(true);
    }
  });

  it('getTemplate returns the correct template', () => {
    const tpl = getTemplate('tpl_lead_nurture');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('Lead Nurture Sequence');
  });

  it('getTemplate returns undefined for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  describe('individual template structure', () => {
    it('lead-nurture has scoring, condition, and email actions', () => {
      const tpl = getTemplate('tpl_lead_nurture')!;
      const hasCondition = Object.values(tpl.nodes).some((n) => n.type === 'condition');
      const hasAction = Object.values(tpl.nodes).some((n) => n.type === 'action');
      expect(hasCondition).toBe(true);
      expect(hasAction).toBe(true);
    });

    it('order-fulfillment has parallel node', () => {
      const tpl = getTemplate('tpl_order_fulfillment')!;
      const hasParallel = Object.values(tpl.nodes).some((n) => n.type === 'parallel');
      expect(hasParallel).toBe(true);
    });

    it('onboarding has loop node', () => {
      const tpl = getTemplate('tpl_customer_onboarding')!;
      const hasLoop = Object.values(tpl.nodes).some((n) => n.type === 'loop');
      expect(hasLoop).toBe(true);
    });

    it('reporting has parallel data collection', () => {
      const tpl = getTemplate('tpl_automated_reporting')!;
      const hasParallel = Object.values(tpl.nodes).some((n) => n.type === 'parallel');
      expect(hasParallel).toBe(true);
    });

    it('churn-prevention has parallel and condition nodes', () => {
      const tpl = getTemplate('tpl_churn_prevention')!;
      const hasParallel = Object.values(tpl.nodes).some((n) => n.type === 'parallel');
      const hasCondition = Object.values(tpl.nodes).some((n) => n.type === 'condition');
      expect(hasParallel).toBe(true);
      expect(hasCondition).toBe(true);
    });
  });
});
