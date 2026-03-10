import type { WorkflowDefinition } from '../types/index.js';

export { leadNurtureTemplate } from './lead-nurture.template.js';
export { orderFulfillmentTemplate } from './order-fulfillment.template.js';
export { supportEscalationTemplate } from './support-escalation.template.js';
export { onboardingTemplate } from './onboarding.template.js';
export { reportingTemplate } from './reporting.template.js';
export { churnPreventionTemplate } from './churn-prevention.template.js';

import { leadNurtureTemplate } from './lead-nurture.template.js';
import { orderFulfillmentTemplate } from './order-fulfillment.template.js';
import { supportEscalationTemplate } from './support-escalation.template.js';
import { onboardingTemplate } from './onboarding.template.js';
import { reportingTemplate } from './reporting.template.js';
import { churnPreventionTemplate } from './churn-prevention.template.js';

/** All built-in workflow templates */
export const WORKFLOW_TEMPLATES: WorkflowDefinition[] = [
  leadNurtureTemplate,
  orderFulfillmentTemplate,
  supportEscalationTemplate,
  onboardingTemplate,
  reportingTemplate,
  churnPreventionTemplate,
];

/**
 * Get a workflow template by id.
 */
export function getTemplate(templateId: string): WorkflowDefinition | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
}
