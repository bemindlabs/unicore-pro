import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { AgentTool } from '../types/agent.types';

export type ToolCategory =
  | 'web'
  | 'data'
  | 'communication'
  | 'storage'
  | 'analytics'
  | 'erp'
  | 'custom';

export interface RegisteredTool extends AgentTool {
  category: ToolCategory;
  version: string;
  /** Minimum license tier required to use this tool. */
  requiredTier: 'community' | 'pro' | 'enterprise';
  handler?: (...args: unknown[]) => Promise<unknown>;
}

export interface ToolFilter {
  category?: ToolCategory;
  requiredTier?: RegisteredTool['requiredTier'];
  available?: boolean;
  nameContains?: string;
}

/**
 * Central registry for all tools that can be attached to a custom agent.
 *
 * Tools are registered once at module initialisation (or dynamically by
 * integrations) and queried at wizard step 3 (tool selection) and at
 * agent runtime.
 */
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor() {
    this.registerBuiltins();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.id)) {
      throw new ConflictException(
        `Tool "${tool.id}" is already registered. Use update() to replace it.`,
      );
    }
    this.tools.set(tool.id, { ...tool });
  }

  update(id: string, patch: Partial<Omit<RegisteredTool, 'id'>>): RegisteredTool {
    const existing = this.getById(id);
    const updated: RegisteredTool = { ...existing, ...patch, id };
    this.tools.set(id, updated);
    return { ...updated };
  }

  unregister(id: string): void {
    if (!this.tools.has(id)) {
      throw new NotFoundException(`Tool "${id}" is not registered.`);
    }
    this.tools.delete(id);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getById(id: string): RegisteredTool {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new NotFoundException(`Tool "${id}" not found in registry.`);
    }
    return { ...tool };
  }

  list(filter: ToolFilter = {}): RegisteredTool[] {
    let results = [...this.tools.values()];

    if (filter.category !== undefined) {
      results = results.filter((t) => t.category === filter.category);
    }
    if (filter.requiredTier !== undefined) {
      results = results.filter((t) => t.requiredTier === filter.requiredTier);
    }
    if (filter.available !== undefined) {
      results = results.filter((t) => t.available === filter.available);
    }
    if (filter.nameContains !== undefined) {
      const q = filter.nameContains.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Return tools actually available for a given agent (subset of list). */
  getAvailableForAgent(toolIds: string[]): RegisteredTool[] {
    return toolIds
      .map((id) => {
        try {
          return this.getById(id);
        } catch {
          return null;
        }
      })
      .filter((t): t is RegisteredTool => t !== null && t.available);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  count(): number {
    return this.tools.size;
  }

  // ── Built-in tools ────────────────────────────────────────────────────────

  private registerBuiltins(): void {
    const builtins: RegisteredTool[] = [
      {
        id: 'web_search',
        name: 'Web Search',
        description: 'Search the web for current information.',
        category: 'web',
        version: '1.0.0',
        requiredTier: 'community',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            maxResults: { type: 'number', description: 'Maximum results', default: 5 },
          },
          required: ['query'],
        },
      },
      {
        id: 'web_fetch',
        name: 'Web Fetch',
        description: 'Fetch and parse the content of a URL.',
        category: 'web',
        version: '1.0.0',
        requiredTier: 'community',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
          },
          required: ['url'],
        },
      },
      {
        id: 'send_email',
        name: 'Send Email',
        description: 'Send an email via the configured mail provider.',
        category: 'communication',
        version: '1.0.0',
        requiredTier: 'pro',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            cc: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        id: 'query_database',
        name: 'Query Database',
        description: 'Run a read-only query against the business database.',
        category: 'data',
        version: '1.0.0',
        requiredTier: 'pro',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            sql: { type: 'string' },
            params: { type: 'array', items: { type: 'string' } },
          },
          required: ['sql'],
        },
      },
      {
        id: 'create_erp_record',
        name: 'Create ERP Record',
        description: 'Create a new record in the ERP module (invoice, task, lead…).',
        category: 'erp',
        version: '1.0.0',
        requiredTier: 'pro',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            module: { type: 'string', enum: ['invoice', 'task', 'lead', 'contact'] },
            data: { type: 'object' },
          },
          required: ['module', 'data'],
        },
      },
      {
        id: 'read_file',
        name: 'Read File',
        description: "Read a file from the agent's workspace storage.",
        category: 'storage',
        version: '1.0.0',
        requiredTier: 'community',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
      {
        id: 'write_file',
        name: 'Write File',
        description: "Write or overwrite a file in the agent's workspace storage.",
        category: 'storage',
        version: '1.0.0',
        requiredTier: 'community',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
      {
        id: 'analytics_event',
        name: 'Track Analytics Event',
        description: 'Track a custom analytics event for business intelligence.',
        category: 'analytics',
        version: '1.0.0',
        requiredTier: 'pro',
        available: true,
        parameters: {
          type: 'object',
          properties: {
            event: { type: 'string' },
            properties: { type: 'object' },
          },
          required: ['event'],
        },
      },
    ];

    for (const tool of builtins) {
      this.tools.set(tool.id, tool);
    }
  }
}
