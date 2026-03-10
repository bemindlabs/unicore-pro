/**
 * WorkflowBuilderService — programmatic workflow construction DSL.
 *
 * Provides a fluent builder API for creating WorkflowDefinitions in TypeScript
 * without hand-crafting JSON, and a YAML serialiser/deserialiser.
 */

import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowVariable,
  TriggerNode,
  ActionNode,
  ConditionNode,
  LoopNode,
  ParallelNode,
  EndNode,
  TriggerConfig,
  ActionConfig,
  ConditionNodeConfig,
  LoopConfig,
  ParallelConfig,
  ParallelBranchDef,
  RetryPolicy,
  TimeoutConfig,
} from '../types/index.js';
import { WorkflowValidator } from '../validator/workflow.validator.js';

// ---------------------------------------------------------------------------
// WorkflowBuilder
// ---------------------------------------------------------------------------

export class WorkflowBuilder {
  private readonly definition: WorkflowDefinition;
  private readonly validator = new WorkflowValidator();

  constructor(name: string, id?: string) {
    const now = new Date().toISOString();
    this.definition = {
      schemaVersion: '1.0.0',
      id: id ?? uuidv4(),
      name,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      entryNodeId: '',
      nodes: {},
    };
  }

  // ---------------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------------

  description(desc: string): this {
    this.definition.description = desc;
    return this;
  }

  tags(...tags: string[]): this {
    this.definition.tags = [...(this.definition.tags ?? []), ...tags];
    return this;
  }

  status(status: WorkflowDefinition['status']): this {
    this.definition.status = status;
    return this;
  }

  inputSchema(...vars: WorkflowVariable[]): this {
    this.definition.inputSchema = [...(this.definition.inputSchema ?? []), ...vars];
    return this;
  }

  outputSchema(...vars: WorkflowVariable[]): this {
    this.definition.outputSchema = [...(this.definition.outputSchema ?? []), ...vars];
    return this;
  }

  settings(settings: WorkflowDefinition['settings']): this {
    this.definition.settings = { ...this.definition.settings, ...settings };
    return this;
  }

  // ---------------------------------------------------------------------------
  // Trigger node
  // ---------------------------------------------------------------------------

  addTrigger(
    id: string,
    name: string,
    triggerConfig: TriggerConfig,
    nextNodeId: string,
    options?: { description?: string; tags?: string[]; metadata?: Record<string, unknown> },
  ): this {
    const node: TriggerNode = {
      id,
      name,
      type: 'trigger',
      triggerConfig,
      nextNodeId,
      ...options,
    };
    this.addNode(node);
    if (!this.definition.entryNodeId) {
      this.definition.entryNodeId = id;
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // Action node
  // ---------------------------------------------------------------------------

  addAction(
    id: string,
    name: string,
    actionConfig: ActionConfig,
    options?: {
      description?: string;
      nextNodeId?: string;
      onErrorNodeId?: string;
      outputVariable?: string;
      retryPolicy?: RetryPolicy;
      timeout?: TimeoutConfig;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): this {
    const node: ActionNode = {
      id,
      name,
      type: 'action',
      actionConfig,
      ...options,
    };
    this.addNode(node);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Condition node
  // ---------------------------------------------------------------------------

  addCondition(
    id: string,
    name: string,
    conditionConfig: ConditionNodeConfig,
    options?: {
      description?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): this {
    const node: ConditionNode = {
      id,
      name,
      type: 'condition',
      conditionConfig,
      ...options,
    };
    this.addNode(node);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Loop node
  // ---------------------------------------------------------------------------

  addLoop(
    id: string,
    name: string,
    loopConfig: LoopConfig,
    bodyNodeId: string,
    options?: {
      description?: string;
      nextNodeId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): this {
    const node: LoopNode = {
      id,
      name,
      type: 'loop',
      loopConfig,
      bodyNodeId,
      ...options,
    };
    this.addNode(node);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Parallel node
  // ---------------------------------------------------------------------------

  addParallel(
    id: string,
    name: string,
    parallelConfig: ParallelConfig,
    branches: ParallelBranchDef[],
    options?: {
      description?: string;
      nextNodeId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): this {
    const node: ParallelNode = {
      id,
      name,
      type: 'parallel',
      parallelConfig,
      branches,
      ...options,
    };
    this.addNode(node);
    return this;
  }

  // ---------------------------------------------------------------------------
  // End node
  // ---------------------------------------------------------------------------

  addEnd(
    id: string,
    name: string,
    options?: {
      outcome?: string;
      description?: string;
      outputMapping?: Record<string, string>;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): this {
    const node: EndNode = {
      id,
      name,
      type: 'end',
      ...options,
    };
    this.addNode(node);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Set entry node explicitly
  // ---------------------------------------------------------------------------

  entry(nodeId: string): this {
    this.definition.entryNodeId = nodeId;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  build(validate = true): WorkflowDefinition {
    this.definition.updatedAt = new Date().toISOString();

    if (validate) {
      const result = this.validator.validate(this.definition);
      if (!result.valid) {
        const messages = result.errors.map((e) => `  [${e.path}] ${e.message}`).join('\n');
        throw new Error(`WorkflowBuilder: invalid definition:\n${messages}`);
      }
    }

    // Return a deep copy so the builder can't be mutated after build
    return JSON.parse(JSON.stringify(this.definition)) as WorkflowDefinition;
  }

  /** Build and return as YAML string */
  toYaml(validate = true): string {
    return yaml.dump(this.build(validate), { lineWidth: 120 });
  }

  /** Build and return as JSON string */
  toJson(validate = true, pretty = true): string {
    return JSON.stringify(this.build(validate), null, pretty ? 2 : 0);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private addNode(node: WorkflowNode): void {
    if (this.definition.nodes[node.id]) {
      throw new Error(`WorkflowBuilder: node id "${node.id}" already exists`);
    }
    this.definition.nodes[node.id] = node;
  }
}

// ---------------------------------------------------------------------------
// WorkflowBuilderService — NestJS-injectable service
// ---------------------------------------------------------------------------

/**
 * NestJS-injectable service that provides factory methods for creating
 * WorkflowBuilders and parsing workflow definitions from JSON/YAML.
 */
export class WorkflowBuilderService {
  private readonly validator = new WorkflowValidator();

  /**
   * Create a new WorkflowBuilder.
   */
  create(name: string, id?: string): WorkflowBuilder {
    return new WorkflowBuilder(name, id);
  }

  /**
   * Parse a WorkflowDefinition from a JSON string.
   */
  fromJson(json: string): WorkflowDefinition {
    const definition = JSON.parse(json) as WorkflowDefinition;
    return this.validateAndReturn(definition);
  }

  /**
   * Parse a WorkflowDefinition from a YAML string.
   */
  fromYaml(yamlStr: string): WorkflowDefinition {
    const definition = yaml.load(yamlStr) as WorkflowDefinition;
    return this.validateAndReturn(definition);
  }

  /**
   * Clone a definition and give it a new id.
   */
  clone(definition: WorkflowDefinition, newName?: string): WorkflowDefinition {
    const now = new Date().toISOString();
    const clone = JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
    clone.id = uuidv4();
    clone.name = newName ?? `${definition.name} (copy)`;
    clone.status = 'draft';
    clone.createdAt = now;
    clone.updatedAt = now;
    return clone;
  }

  /**
   * Validate a definition.
   */
  validate(definition: WorkflowDefinition) {
    return this.validator.validate(definition);
  }

  private validateAndReturn(definition: WorkflowDefinition): WorkflowDefinition {
    const result = this.validator.validate(definition);
    if (!result.valid) {
      const messages = result.errors.map((e) => `  [${e.path}] ${e.message}`).join('\n');
      throw new Error(`Invalid workflow definition:\n${messages}`);
    }
    return definition;
  }
}
