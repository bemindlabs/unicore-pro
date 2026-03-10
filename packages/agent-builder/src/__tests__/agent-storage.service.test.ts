import { AgentStorageService, CreateAgentDto } from '../services/agent-storage.service';
import { AgentModelConfig } from '../types/agent.types';

const defaultModelConfig: AgentModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
};

const baseDto: CreateAgentDto = {
  name: 'Test Agent',
  description: 'A test agent',
  systemPrompt: 'You are a helpful assistant.',
  modelConfig: defaultModelConfig,
  createdBy: 'user-1',
};

describe('AgentStorageService', () => {
  let service: AgentStorageService;

  beforeEach(() => {
    service = new AgentStorageService();
  });

  // ── Create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create an agent with version 1 and draft status', async () => {
      const agent = await service.create(baseDto);

      expect(agent.id).toBeTruthy();
      expect(agent.name).toBe('Test Agent');
      expect(agent.version).toBe(1);
      expect(agent.status).toBe('draft');
      expect(agent.createdBy).toBe('user-1');
    });

    it('should record the initial version in history', async () => {
      const agent = await service.create(baseDto);
      const history = await service.getVersionHistory(agent.id);

      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(1);
      expect(history[0].changeNote).toBe('Initial creation');
    });

    it('should throw ConflictException for duplicate name + owner', async () => {
      await service.create(baseDto);
      await expect(service.create(baseDto)).rejects.toThrow('already exists');
    });

    it('should allow different users to create agents with the same name', async () => {
      const a1 = await service.create({ ...baseDto, createdBy: 'user-1' });
      const a2 = await service.create({ ...baseDto, createdBy: 'user-2' });
      expect(a1.id).not.toBe(a2.id);
    });
  });

  // ── Read ─────────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return the created agent', async () => {
      const created = await service.create(baseDto);
      const found = await service.findById(created.id);
      expect(found.id).toBe(created.id);
    });

    it('should throw NotFoundException for unknown id', async () => {
      await expect(service.findById('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('findAll()', () => {
    it('should return all agents when no filter is applied', async () => {
      await service.create({ ...baseDto, name: 'A1' });
      await service.create({ ...baseDto, name: 'A2' });
      const all = await service.findAll();
      expect(all).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const a = await service.create(baseDto);
      await service.activate(a.id, 'user-1');
      const active = await service.findAll({ status: 'active' });
      expect(active).toHaveLength(1);
      const draft = await service.findAll({ status: 'draft' });
      expect(draft).toHaveLength(0);
    });

    it('should filter by tags', async () => {
      await service.create({ ...baseDto, name: 'A-tagged', tags: ['crm', 'email'] });
      await service.create({ ...baseDto, name: 'A-plain' });
      const tagged = await service.findAll({ tags: ['crm'] });
      expect(tagged).toHaveLength(1);
      expect(tagged[0].name).toBe('A-tagged');
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should increment version on update', async () => {
      const agent = await service.create(baseDto);
      const updated = await service.update(agent.id, {
        name: 'Updated Agent',
        updatedBy: 'user-1',
      });
      expect(updated.version).toBe(2);
      expect(updated.name).toBe('Updated Agent');
    });

    it('should add a version snapshot for each update', async () => {
      const agent = await service.create(baseDto);
      await service.update(agent.id, { name: 'V2', updatedBy: 'user-1', changeNote: 'rename' });
      await service.update(agent.id, { name: 'V3', updatedBy: 'user-1', changeNote: 'rename again' });
      const history = await service.getVersionHistory(agent.id);
      expect(history).toHaveLength(3); // initial + 2 updates
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should remove the agent', async () => {
      const agent = await service.create(baseDto);
      await service.delete(agent.id);
      await expect(service.findById(agent.id)).rejects.toThrow('not found');
    });
  });

  // ── Versioning ────────────────────────────────────────────────────────────

  describe('restoreVersion()', () => {
    it('should restore an older snapshot and bump version', async () => {
      const agent = await service.create(baseDto);
      await service.update(agent.id, { name: 'V2', updatedBy: 'user-1' });
      const restored = await service.restoreVersion(agent.id, 1, 'user-1');
      expect(restored.name).toBe('Test Agent');
      expect(restored.version).toBe(3);
    });
  });

  // ── Status transitions ────────────────────────────────────────────────────

  describe('status transitions', () => {
    it('should activate an agent', async () => {
      const agent = await service.create(baseDto);
      const activated = await service.activate(agent.id, 'user-1');
      expect(activated.status).toBe('active');
    });

    it('should archive an agent', async () => {
      const agent = await service.create(baseDto);
      const archived = await service.archive(agent.id, 'user-1');
      expect(archived.status).toBe('archived');
    });
  });
});
