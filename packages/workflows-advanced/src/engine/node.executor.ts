/**
 * Node executor — handles running individual node types.
 * Action side-effects are delegated through the ActionHandler interface
 * so real integrations can be injected separately.
 */

import type {
  WorkflowNode,
  ActionNode,
  TriggerNode,
  ConditionNode,
  LoopNode,
  ParallelNode,
  EndNode,
  WorkflowContext,
  WorkflowDefinition,
} from '../types/index.js';
import { ConditionEvaluator, resolveCount } from './condition.evaluator.js';
import { cloneContext, setContextPath, mergeContext } from './context.js';

// ---------------------------------------------------------------------------
// ActionHandler interface — implement to connect real integrations
// ---------------------------------------------------------------------------

export interface ActionHandler {
  /** The action type this handler supports */
  actionType: string;
  /**
   * Execute the action.
   * @returns A context patch that is merged into the execution context.
   */
  execute(
    node: ActionNode,
    context: WorkflowContext,
    dryRun?: boolean,
  ): Promise<WorkflowContext>;
}

// ---------------------------------------------------------------------------
// Execution result from a single node
// ---------------------------------------------------------------------------

export interface NodeResult {
  /** ID of the next node to execute (undefined means stop) */
  nextNodeId?: string;
  /** Context updates to apply */
  contextPatch: WorkflowContext;
  /** Whether execution should stop for all parallel branches (used in parallel) */
  halt?: boolean;
}

// ---------------------------------------------------------------------------
// NodeExecutor
// ---------------------------------------------------------------------------

export class NodeExecutor {
  private readonly conditionEvaluator = new ConditionEvaluator();
  private readonly actionHandlers = new Map<string, ActionHandler>();

  registerActionHandler(handler: ActionHandler): void {
    this.actionHandlers.set(handler.actionType, handler);
  }

  async executeNode(
    node: WorkflowNode,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    dryRun = false,
  ): Promise<NodeResult> {
    switch (node.type) {
      case 'trigger':
        return this.executeTrigger(node, context);
      case 'action':
        return this.executeAction(node, context, dryRun);
      case 'condition':
        return this.executeCondition(node, context);
      case 'loop':
        return this.executeLoop(node, context, definition, dryRun);
      case 'parallel':
        return this.executeParallel(node, context, definition, dryRun);
      case 'end':
        return this.executeEnd(node, context);
      default: {
        const exhaustive: never = node;
        throw new Error(`Unknown node type: ${(exhaustive as WorkflowNode).type}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Trigger — just routes to next node, trigger setup is handled externally
  // ---------------------------------------------------------------------------

  private executeTrigger(node: TriggerNode, _context: WorkflowContext): NodeResult {
    return { nextNodeId: node.nextNodeId, contextPatch: {} };
  }

  // ---------------------------------------------------------------------------
  // Action
  // ---------------------------------------------------------------------------

  private async executeAction(
    node: ActionNode,
    context: WorkflowContext,
    dryRun: boolean,
  ): Promise<NodeResult> {
    const actionType = node.actionConfig.actionType;
    const handler = this.actionHandlers.get(actionType);

    let contextPatch: WorkflowContext = {};

    if (dryRun) {
      // In dry-run mode skip all side-effecting handlers
    } else if (handler) {
      contextPatch = await handler.execute(node, context, dryRun);
    } else {
      // No handler registered — log and continue (graceful degradation)
      console.warn(`[WorkflowEngine] No handler registered for action type "${actionType}"`);
    }

    if (node.outputVariable && Object.keys(contextPatch).length > 0) {
      const result: WorkflowContext = {};
      setContextPath(result, node.outputVariable, contextPatch as unknown as import('../types/index.js').ContextValue);
      contextPatch = result;
    }

    return { nextNodeId: node.nextNodeId, contextPatch };
  }

  // ---------------------------------------------------------------------------
  // Condition — evaluate branches and route
  // ---------------------------------------------------------------------------

  private executeCondition(node: ConditionNode, context: WorkflowContext): NodeResult {
    const { branches, defaultNextNodeId } = node.conditionConfig;

    for (const branch of branches) {
      if (this.conditionEvaluator.evaluate(branch.condition, context)) {
        return { nextNodeId: branch.nextNodeId, contextPatch: {} };
      }
    }

    return { nextNodeId: defaultNextNodeId, contextPatch: {} };
  }

  // ---------------------------------------------------------------------------
  // Loop — executes body nodes synchronously for each iteration
  // ---------------------------------------------------------------------------

  private async executeLoop(
    node: LoopNode,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    dryRun: boolean,
  ): Promise<NodeResult> {
    const lc = node.loopConfig;
    let currentContext = cloneContext(context);

    if (lc.loopType === 'for_each') {
      const collection = currentContext[lc.collection.replace(/^\$\./, '')] as unknown[];
      if (!Array.isArray(collection)) {
        throw new Error(`Loop collection "${lc.collection}" is not an array`);
      }

      const concurrency = lc.concurrency ?? 1;

      if (concurrency === 1) {
        // Sequential
        for (let i = 0; i < collection.length; i++) {
          currentContext[lc.itemVariable] = collection[i] as import('../types/index.js').ContextValue;
          if (lc.indexVariable) currentContext[lc.indexVariable] = i;
          currentContext = await this.runSubgraph(
            node.bodyNodeId,
            currentContext,
            definition,
            dryRun,
          );
        }
      } else {
        // Concurrent batches
        const chunks = chunkArray(collection, concurrency);
        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map((item, i) => {
              const iterCtx = cloneContext(currentContext);
              iterCtx[lc.itemVariable] = item as import('../types/index.js').ContextValue;
              if (lc.indexVariable) iterCtx[lc.indexVariable] = i;
              return this.runSubgraph(node.bodyNodeId, iterCtx, definition, dryRun);
            }),
          );
          // Merge last result back (concurrent: last writer wins for shared keys)
          for (const r of results) {
            currentContext = mergeContext(currentContext, r);
          }
        }
      }
    } else if (lc.loopType === 'while') {
      const maxIter = lc.maxIterations ?? 1000;
      let iter = 0;
      while (
        iter < maxIter &&
        this.conditionEvaluator.evaluate(lc.condition, currentContext)
      ) {
        currentContext = await this.runSubgraph(
          node.bodyNodeId,
          currentContext,
          definition,
          dryRun,
        );
        iter++;
      }
    } else if (lc.loopType === 'count') {
      const count = resolveCount(lc.count, currentContext);
      for (let i = 0; i < count; i++) {
        if (lc.indexVariable) currentContext[lc.indexVariable] = i;
        currentContext = await this.runSubgraph(
          node.bodyNodeId,
          currentContext,
          definition,
          dryRun,
        );
      }
    }

    // Patch is the diff between original and final context
    const contextPatch = diffContext(context, currentContext);
    return { nextNodeId: node.nextNodeId, contextPatch };
  }

  // ---------------------------------------------------------------------------
  // Parallel — runs branches concurrently
  // ---------------------------------------------------------------------------

  private async executeParallel(
    node: ParallelNode,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    dryRun: boolean,
  ): Promise<NodeResult> {
    const { waitStrategy, minRequired, maxConcurrency } = node.parallelConfig;
    const branches = node.branches;

    const runBranch = (branchEntryId: string): Promise<WorkflowContext> =>
      this.runSubgraph(branchEntryId, cloneContext(context), definition, dryRun);

    let branchContexts: WorkflowContext[];

    if (maxConcurrency && maxConcurrency < branches.length) {
      // Run in limited concurrency batches
      const results: WorkflowContext[] = [];
      const chunks = chunkArray(branches, maxConcurrency);
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(chunk.map((b) => runBranch(b.entryNodeId)));
        results.push(...chunkResults);
      }
      branchContexts = results;
    } else if (waitStrategy === 'any') {
      // Promise.race — first one to complete wins
      const first = await Promise.race(branches.map((b) => runBranch(b.entryNodeId)));
      branchContexts = [first];
    } else if (waitStrategy === 'n_of_m' && minRequired) {
      branchContexts = await raceN(
        branches.map((b) => runBranch(b.entryNodeId)),
        minRequired,
      );
    } else {
      // Default: all
      branchContexts = await Promise.all(branches.map((b) => runBranch(b.entryNodeId)));
    }

    // Merge all branch results into one context patch
    let merged: WorkflowContext = {};
    for (const bc of branchContexts) {
      merged = mergeContext(merged, bc);
    }

    const contextPatch = diffContext(context, merged);
    return { nextNodeId: node.nextNodeId, contextPatch };
  }

  // ---------------------------------------------------------------------------
  // End
  // ---------------------------------------------------------------------------

  private executeEnd(node: EndNode, context: WorkflowContext): NodeResult {
    const contextPatch: WorkflowContext = {};
    if (node.outputMapping) {
      for (const [key, sourcePath] of Object.entries(node.outputMapping)) {
        const value = context[sourcePath.replace(/^\$\./, '')] as import('../types/index.js').ContextValue;
        contextPatch[key] = value;
      }
    }
    return { nextNodeId: undefined, contextPatch };
  }

  // ---------------------------------------------------------------------------
  // Subgraph runner — executes a linear chain within a branch/loop body
  // ---------------------------------------------------------------------------

  private async runSubgraph(
    entryNodeId: string,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    dryRun: boolean,
  ): Promise<WorkflowContext> {
    let currentNodeId: string | undefined = entryNodeId;
    let currentContext = cloneContext(context);

    const visited = new Set<string>();

    while (currentNodeId) {
      if (visited.has(currentNodeId)) {
        throw new Error(
          `Cycle detected in subgraph: node "${currentNodeId}" visited twice`,
        );
      }
      visited.add(currentNodeId);

      const node = definition.nodes[currentNodeId];
      if (!node) {
        throw new Error(`Node "${currentNodeId}" not found in workflow definition`);
      }

      // End nodes exit the subgraph (loop body ends)
      if (node.type === 'end') break;

      const result = await this.executeNode(node, currentContext, definition, dryRun);
      currentContext = mergeContext(currentContext, result.contextPatch);
      currentNodeId = result.nextNodeId;
    }

    return currentContext;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Resolves when at least `n` promises have fulfilled.
 */
async function raceN<T>(promises: Promise<T>[], n: number): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    let failures = 0;
    const total = promises.length;

    for (const p of promises) {
      p.then((value) => {
        results.push(value);
        if (results.length >= n) resolve(results.slice(0, n));
      }).catch(() => {
        failures++;
        if (failures > total - n) reject(new Error('Not enough branches succeeded'));
      });
    }
  });
}

/**
 * Returns key-value pairs that are present in `next` but different from `base`.
 */
function diffContext(base: WorkflowContext, next: WorkflowContext): WorkflowContext {
  const diff: WorkflowContext = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(base[key]) !== JSON.stringify(value)) {
      diff[key] = value as import('../types/index.js').ContextValue;
    }
  }
  return diff;
}
