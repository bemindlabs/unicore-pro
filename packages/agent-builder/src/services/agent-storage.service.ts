import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  CustomAgent,
  AgentVersion,
  AgentStatus,
  AgentModelConfig,
  AgentTool,
} from '../types/agent.types';

export interface CreateAgentDto {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: AgentTool[];
  modelConfig: AgentModelConfig;
  tags?: string[];
  createdBy: string;
}

export interface UpdateAgentDto {
  name?: string;
  description?: string;
  systemPrompt?: string;
  tools?: AgentTool[];
  modelConfig?: Partial<AgentModelConfig>;
  tags?: string[];
  status?: AgentStatus;
  changeNote?: string;
  updatedBy: string;
}

export interface AgentListOptions {
  status?: AgentStatus;
  tags?: string[];
  createdBy?: string;
  limit?: number;
  offset?: number;
}

/**
 * In-process storage service for custom agents with full versioning.
 *
 * In production this would delegate to a Prisma repository backed by
 * PostgreSQL. The in-memory maps make the service fully testable without a
 * database connection.
 */
@Injectable()
export class AgentStorageService {
  /** Primary store: agentId → latest CustomAgent */
  private readonly agents = new Map<string, CustomAgent>();

  /** Version history: agentId → ordered list of snapshots */
  private readonly versions = new Map<string, AgentVersion[]>();

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateAgentDto): Promise<CustomAgent> {
    const existing = [...this.agents.values()].find(
      (a) => a.name === dto.name && a.createdBy === dto.createdBy,
    );
    if (existing) {
      throw new ConflictException(
        `An agent named "${dto.name}" already exists for this user.`,
      );
    }

    const now = new Date();
    const agent: CustomAgent = {
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      version: 1,
      systemPrompt: dto.systemPrompt,
      tools: dto.tools ?? [],
      modelConfig: dto.modelConfig,
      status: 'draft',
      tags: dto.tags ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: dto.createdBy,
    };

    this.agents.set(agent.id, agent);
    this.recordVersion(agent, 'Initial creation', dto.createdBy);

    return agent;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<CustomAgent> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new NotFoundException(`Agent "${id}" not found.`);
    }
    return { ...agent };
  }

  async findAll(options: AgentListOptions = {}): Promise<CustomAgent[]> {
    let results = [...this.agents.values()];

    if (options.status !== undefined) {
      results = results.filter((a) => a.status === options.status);
    }
    if (options.createdBy !== undefined) {
      results = results.filter((a) => a.createdBy === options.createdBy);
    }
    if (options.tags && options.tags.length > 0) {
      results = results.filter((a) =>
        options.tags!.every((tag) => a.tags.includes(tag)),
      );
    }

    results.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit).map((a) => ({ ...a }));
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAgentDto): Promise<CustomAgent> {
    const current = await this.findById(id);

    const updated: CustomAgent = {
      ...current,
      name: dto.name ?? current.name,
      description: dto.description ?? current.description,
      systemPrompt: dto.systemPrompt ?? current.systemPrompt,
      tools: dto.tools ?? current.tools,
      modelConfig: dto.modelConfig
        ? { ...current.modelConfig, ...dto.modelConfig }
        : current.modelConfig,
      tags: dto.tags ?? current.tags,
      status: dto.status ?? current.status,
      version: current.version + 1,
      updatedAt: new Date(),
    };

    this.agents.set(id, updated);
    this.recordVersion(
      updated,
      dto.changeNote ?? `Version ${updated.version}`,
      dto.updatedBy,
    );

    return { ...updated };
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    if (!this.agents.has(id)) {
      throw new NotFoundException(`Agent "${id}" not found.`);
    }
    this.agents.delete(id);
    this.versions.delete(id);
  }

  // ── Status transitions ────────────────────────────────────────────────────

  async activate(id: string, updatedBy: string): Promise<CustomAgent> {
    return this.update(id, { status: 'active', updatedBy, changeNote: 'Activated' });
  }

  async archive(id: string, updatedBy: string): Promise<CustomAgent> {
    return this.update(id, { status: 'archived', updatedBy, changeNote: 'Archived' });
  }

  async setTesting(id: string, updatedBy: string): Promise<CustomAgent> {
    return this.update(id, { status: 'testing', updatedBy, changeNote: 'Set to testing' });
  }

  // ── Versioning ────────────────────────────────────────────────────────────

  async getVersionHistory(agentId: string): Promise<AgentVersion[]> {
    await this.findById(agentId); // ensure agent exists
    return (this.versions.get(agentId) ?? []).map((v) => ({ ...v }));
  }

  async getVersion(agentId: string, version: number): Promise<AgentVersion> {
    const history = await this.getVersionHistory(agentId);
    const found = history.find((v) => v.version === version);
    if (!found) {
      throw new NotFoundException(
        `Version ${version} of agent "${agentId}" not found.`,
      );
    }
    return { ...found };
  }

  async restoreVersion(
    agentId: string,
    version: number,
    restoredBy: string,
  ): Promise<CustomAgent> {
    const snapshot = await this.getVersion(agentId, version);
    const current = await this.findById(agentId);

    const restored: CustomAgent = {
      ...snapshot.snapshot,
      version: current.version + 1,
      updatedAt: new Date(),
    };

    this.agents.set(agentId, restored);
    this.recordVersion(
      restored,
      `Restored from version ${version}`,
      restoredBy,
    );

    return { ...restored };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private recordVersion(
    agent: CustomAgent,
    changeNote: string,
    createdBy: string,
  ): void {
    const history = this.versions.get(agent.id) ?? [];
    history.push({
      agentId: agent.id,
      version: agent.version,
      snapshot: { ...agent },
      changeNote,
      createdAt: new Date(),
      createdBy,
    });
    this.versions.set(agent.id, history);
  }
}
