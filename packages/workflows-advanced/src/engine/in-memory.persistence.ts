/**
 * In-memory persistence adapter.
 * For testing and development — does not persist across restarts.
 */

import type {
  StatePersistenceAdapter,
  WorkflowExecution,
  NodeExecutionRecord,
  WorkflowExecutionStatus,
} from '../types/index.js';

export class InMemoryPersistenceAdapter implements StatePersistenceAdapter {
  private readonly executions = new Map<string, WorkflowExecution>();

  async saveExecution(execution: WorkflowExecution): Promise<void> {
    this.executions.set(execution.id, { ...execution });
  }

  async updateExecution(
    executionId: string,
    patch: Partial<WorkflowExecution>,
  ): Promise<void> {
    const existing = this.executions.get(executionId);
    if (!existing) {
      throw new Error(`Execution "${executionId}" not found`);
    }
    this.executions.set(executionId, { ...existing, ...patch });
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    return this.executions.get(executionId) ?? null;
  }

  async listExecutions(
    workflowId: string,
    options?: {
      status?: WorkflowExecutionStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowExecution[]> {
    let results = [...this.executions.values()].filter(
      (e) => e.workflowId === workflowId,
    );

    if (options?.status) {
      results = results.filter((e) => e.status === options.status);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? results.length;

    return results.slice(offset, offset + limit);
  }

  async purgeHistory(workflowId: string, before: Date): Promise<number> {
    let count = 0;
    for (const [id, execution] of this.executions.entries()) {
      if (
        execution.workflowId === workflowId &&
        execution.startedAt &&
        new Date(execution.startedAt) < before
      ) {
        this.executions.delete(id);
        count++;
      }
    }
    return count;
  }

  async appendNodeRecord(
    executionId: string,
    record: NodeExecutionRecord,
  ): Promise<void> {
    const existing = this.executions.get(executionId);
    if (!existing) return;
    existing.nodeHistory = [...existing.nodeHistory, record];
  }

  /** Test helper: get all executions */
  getAllExecutions(): WorkflowExecution[] {
    return [...this.executions.values()];
  }

  /** Test helper: clear store */
  clear(): void {
    this.executions.clear();
  }
}
