/**
 * @unicore/workflows-advanced
 * Advanced workflow engine with DSL, execution, state management, and templates.
 */

// Types
export * from './types/index.js';

// Engine
export {
  WorkflowEngine,
  type WorkflowEngineConfig,
} from './engine/workflow.engine.js';
export {
  NodeExecutor,
  type ActionHandler,
  type NodeResult,
} from './engine/node.executor.js';
export {
  ConditionEvaluator,
  resolveCount,
} from './engine/condition.evaluator.js';
export {
  resolveContextPath,
  setContextPath,
  interpolate,
  cloneContext,
  mergeContext,
} from './engine/context.js';
export { InMemoryPersistenceAdapter } from './engine/in-memory.persistence.js';

// Validator
export {
  WorkflowValidator,
  type ValidationResult,
  type ValidationError,
} from './validator/workflow.validator.js';

// Builder
export { WorkflowBuilder, WorkflowBuilderService } from './builder/workflow.builder.js';

// Templates
export {
  WORKFLOW_TEMPLATES,
  getTemplate,
  leadNurtureTemplate,
  orderFulfillmentTemplate,
  supportEscalationTemplate,
  onboardingTemplate,
  reportingTemplate,
  churnPreventionTemplate,
} from './templates/index.js';
