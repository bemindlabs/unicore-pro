/**
 * Workflow Validator
 * Validates a WorkflowDefinition for structural correctness.
 */

import type {
  WorkflowDefinition,
  WorkflowNode,
  ConditionNode,
  LoopNode,
  ParallelNode,
  ActionNode,
  TriggerNode,
} from '../types/dsl.types.js';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class WorkflowValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  validate(definition: WorkflowDefinition): ValidationResult {
    this.errors = [];
    this.warnings = [];

    this.validateTopLevel(definition);
    this.validateNodes(definition);
    this.validateReachability(definition);

    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  // ---------------------------------------------------------------------------
  // Top-level validation
  // ---------------------------------------------------------------------------

  private validateTopLevel(def: WorkflowDefinition): void {
    if (!def.id || def.id.trim() === '') {
      this.addError('id', 'Workflow id is required');
    }
    if (!def.name || def.name.trim() === '') {
      this.addError('name', 'Workflow name is required');
    }
    if (!def.schemaVersion) {
      this.addError('schemaVersion', 'schemaVersion is required');
    }
    if (!def.entryNodeId) {
      this.addError('entryNodeId', 'entryNodeId is required');
    }
    if (!def.nodes || Object.keys(def.nodes).length === 0) {
      this.addError('nodes', 'Workflow must have at least one node');
      return; // No point continuing
    }

    if (def.entryNodeId && !def.nodes[def.entryNodeId]) {
      this.addError(
        'entryNodeId',
        `Entry node "${def.entryNodeId}" does not exist in nodes`,
      );
    } else if (def.entryNodeId && def.nodes[def.entryNodeId]) {
      const entryNode = def.nodes[def.entryNodeId];
      if (entryNode.type !== 'trigger') {
        this.addError(
          'entryNodeId',
          `Entry node "${def.entryNodeId}" must be of type "trigger", got "${entryNode.type}"`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Per-node validation
  // ---------------------------------------------------------------------------

  private validateNodes(def: WorkflowDefinition): void {
    const nodeIds = new Set(Object.keys(def.nodes));

    for (const [nodeId, node] of Object.entries(def.nodes)) {
      if (nodeId !== node.id) {
        this.addError(
          `nodes.${nodeId}`,
          `Node key "${nodeId}" does not match node.id "${node.id}"`,
        );
      }
      if (!node.name || node.name.trim() === '') {
        this.addError(`nodes.${nodeId}.name`, 'Node name is required');
      }

      switch (node.type) {
        case 'trigger':
          this.validateTriggerNode(node as TriggerNode, nodeIds);
          break;
        case 'action':
          this.validateActionNode(node as ActionNode, nodeIds);
          break;
        case 'condition':
          this.validateConditionNode(node as ConditionNode, nodeIds);
          break;
        case 'loop':
          this.validateLoopNode(node as LoopNode, nodeIds);
          break;
        case 'parallel':
          this.validateParallelNode(node as ParallelNode, nodeIds);
          break;
        case 'end':
          // end nodes have no required outgoing references
          break;
        default: {
          const exhaustive: never = node;
          this.addError(`nodes.${(exhaustive as WorkflowNode).id}`, 'Unknown node type');
        }
      }

      // Retry policy
      if (node.retryPolicy) {
        const rp = node.retryPolicy;
        if (rp.maxAttempts < 1) {
          this.addWarning(
            `nodes.${nodeId}.retryPolicy.maxAttempts`,
            'maxAttempts should be at least 1',
          );
        }
        if (rp.initialDelayMs < 0) {
          this.addError(
            `nodes.${nodeId}.retryPolicy.initialDelayMs`,
            'initialDelayMs must be >= 0',
          );
        }
      }
    }
  }

  private validateTriggerNode(node: TriggerNode, nodeIds: Set<string>): void {
    const path = `nodes.${node.id}`;
    if (!node.triggerConfig) {
      this.addError(`${path}.triggerConfig`, 'triggerConfig is required');
    }
    this.validateNodeRef(`${path}.nextNodeId`, node.nextNodeId, nodeIds);
  }

  private validateActionNode(node: ActionNode, nodeIds: Set<string>): void {
    const path = `nodes.${node.id}`;
    if (!node.actionConfig) {
      this.addError(`${path}.actionConfig`, 'actionConfig is required');
    }
    if (node.nextNodeId) {
      this.validateNodeRef(`${path}.nextNodeId`, node.nextNodeId, nodeIds);
    }
    if (node.onErrorNodeId) {
      this.validateNodeRef(`${path}.onErrorNodeId`, node.onErrorNodeId, nodeIds);
    }
    if (!node.nextNodeId) {
      this.addWarning(
        `${path}.nextNodeId`,
        'Action node has no nextNodeId — execution will stop here unless it is intentional',
      );
    }
  }

  private validateConditionNode(node: ConditionNode, nodeIds: Set<string>): void {
    const path = `nodes.${node.id}`;
    if (!node.conditionConfig) {
      this.addError(`${path}.conditionConfig`, 'conditionConfig is required');
      return;
    }
    if (!node.conditionConfig.branches || node.conditionConfig.branches.length === 0) {
      this.addError(`${path}.conditionConfig.branches`, 'At least one branch is required');
    } else {
      node.conditionConfig.branches.forEach((branch, i) => {
        if (!branch.condition) {
          this.addError(
            `${path}.conditionConfig.branches[${i}].condition`,
            'Branch condition is required',
          );
        }
        this.validateNodeRef(
          `${path}.conditionConfig.branches[${i}].nextNodeId`,
          branch.nextNodeId,
          nodeIds,
        );
      });
    }
    if (node.conditionConfig.defaultNextNodeId) {
      this.validateNodeRef(
        `${path}.conditionConfig.defaultNextNodeId`,
        node.conditionConfig.defaultNextNodeId,
        nodeIds,
      );
    } else {
      this.addWarning(
        `${path}.conditionConfig.defaultNextNodeId`,
        'No defaultNextNodeId — unmatched conditions will stop execution',
      );
    }
  }

  private validateLoopNode(node: LoopNode, nodeIds: Set<string>): void {
    const path = `nodes.${node.id}`;
    if (!node.loopConfig) {
      this.addError(`${path}.loopConfig`, 'loopConfig is required');
    } else {
      const lc = node.loopConfig;
      if (lc.loopType === 'for_each' && !lc.collection) {
        this.addError(`${path}.loopConfig.collection`, 'collection is required for for_each loop');
      }
      if (lc.loopType === 'while' && !lc.condition) {
        this.addError(`${path}.loopConfig.condition`, 'condition is required for while loop');
      }
      if (lc.loopType === 'count' && (lc.count === undefined || lc.count === null)) {
        this.addError(`${path}.loopConfig.count`, 'count is required for count loop');
      }
    }
    this.validateNodeRef(`${path}.bodyNodeId`, node.bodyNodeId, nodeIds);
    if (node.nextNodeId) {
      this.validateNodeRef(`${path}.nextNodeId`, node.nextNodeId, nodeIds);
    }
  }

  private validateParallelNode(node: ParallelNode, nodeIds: Set<string>): void {
    const path = `nodes.${node.id}`;
    if (!node.parallelConfig) {
      this.addError(`${path}.parallelConfig`, 'parallelConfig is required');
    }
    if (!node.branches || node.branches.length === 0) {
      this.addError(`${path}.branches`, 'Parallel node must have at least one branch');
    } else {
      node.branches.forEach((branch, i) => {
        this.validateNodeRef(
          `${path}.branches[${i}].entryNodeId`,
          branch.entryNodeId,
          nodeIds,
        );
      });
    }
    if (
      node.parallelConfig?.waitStrategy === 'n_of_m' &&
      (node.parallelConfig.minRequired === undefined)
    ) {
      this.addError(
        `${path}.parallelConfig.minRequired`,
        'minRequired is required for n_of_m wait strategy',
      );
    }
    if (node.nextNodeId) {
      this.validateNodeRef(`${path}.nextNodeId`, node.nextNodeId, nodeIds);
    }
  }

  // ---------------------------------------------------------------------------
  // Reachability check — warn about unreachable nodes
  // ---------------------------------------------------------------------------

  private validateReachability(def: WorkflowDefinition): void {
    if (!def.entryNodeId || !def.nodes[def.entryNodeId]) return;

    const reachable = new Set<string>();
    const queue: string[] = [def.entryNodeId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);

      const node = def.nodes[nodeId];
      if (!node) continue;

      const successors = this.getSuccessors(node);
      for (const s of successors) {
        if (!reachable.has(s)) queue.push(s);
      }
    }

    for (const nodeId of Object.keys(def.nodes)) {
      if (!reachable.has(nodeId)) {
        this.addWarning(`nodes.${nodeId}`, `Node "${nodeId}" is unreachable from entry node`);
      }
    }
  }

  private getSuccessors(node: WorkflowNode): string[] {
    const ids: string[] = [];
    switch (node.type) {
      case 'trigger':
        ids.push(node.nextNodeId);
        break;
      case 'action':
        if (node.nextNodeId) ids.push(node.nextNodeId);
        if (node.onErrorNodeId) ids.push(node.onErrorNodeId);
        break;
      case 'condition':
        node.conditionConfig.branches.forEach((b) => ids.push(b.nextNodeId));
        if (node.conditionConfig.defaultNextNodeId) {
          ids.push(node.conditionConfig.defaultNextNodeId);
        }
        break;
      case 'loop':
        ids.push(node.bodyNodeId);
        if (node.nextNodeId) ids.push(node.nextNodeId);
        break;
      case 'parallel':
        node.branches.forEach((b) => ids.push(b.entryNodeId));
        if (node.nextNodeId) ids.push(node.nextNodeId);
        break;
      case 'end':
        break;
    }
    return ids;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateNodeRef(path: string, nodeId: string | undefined, nodeIds: Set<string>): void {
    if (!nodeId) {
      this.addError(path, 'Node reference is required');
      return;
    }
    if (!nodeIds.has(nodeId)) {
      this.addError(path, `Referenced node "${nodeId}" does not exist`);
    }
  }

  private addError(path: string, message: string): void {
    this.errors.push({ path, message, severity: 'error' });
  }

  private addWarning(path: string, message: string): void {
    this.warnings.push({ path, message, severity: 'warning' });
  }
}
