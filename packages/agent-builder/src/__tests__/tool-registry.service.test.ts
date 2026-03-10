import { ToolRegistryService, RegisteredTool } from '../services/tool-registry.service';

const sampleTool: RegisteredTool = {
  id: 'custom_tool',
  name: 'Custom Tool',
  description: 'A custom test tool.',
  category: 'custom',
  version: '1.0.0',
  requiredTier: 'pro',
  available: true,
  parameters: { type: 'object', properties: {}, required: [] },
};

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;

  beforeEach(() => {
    service = new ToolRegistryService();
  });

  describe('constructor', () => {
    it('should pre-register built-in tools', () => {
      expect(service.count()).toBeGreaterThan(0);
    });

    it('should include web_search as a built-in', () => {
      const tool = service.getById('web_search');
      expect(tool.name).toBe('Web Search');
      expect(tool.requiredTier).toBe('community');
    });
  });

  describe('register()', () => {
    it('should register a new tool', () => {
      const before = service.count();
      service.register(sampleTool);
      expect(service.count()).toBe(before + 1);
    });

    it('should throw ConflictException for duplicate id', () => {
      service.register(sampleTool);
      expect(() => service.register(sampleTool)).toThrow('already registered');
    });
  });

  describe('getById()', () => {
    it('should return a registered tool', () => {
      service.register(sampleTool);
      const found = service.getById('custom_tool');
      expect(found.name).toBe('Custom Tool');
    });

    it('should throw NotFoundException for unknown tool', () => {
      expect(() => service.getById('does-not-exist')).toThrow('not found');
    });
  });

  describe('list()', () => {
    it('should filter by category', () => {
      const webTools = service.list({ category: 'web' });
      expect(webTools.every((t) => t.category === 'web')).toBe(true);
    });

    it('should filter by availability', () => {
      service.register({ ...sampleTool, id: 'unavailable_tool', available: false });
      const available = service.list({ available: true });
      expect(available.every((t) => t.available)).toBe(true);
    });

    it('should filter by name search', () => {
      const results = service.list({ nameContains: 'search' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((t) => t.id === 'web_search')).toBe(true);
    });

    it('should return tools sorted alphabetically by name', () => {
      const tools = service.list();
      const names = tools.map((t) => t.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });
  });

  describe('update()', () => {
    it('should update tool properties', () => {
      service.register(sampleTool);
      const updated = service.update('custom_tool', { available: false });
      expect(updated.available).toBe(false);
    });
  });

  describe('unregister()', () => {
    it('should remove a tool from the registry', () => {
      service.register(sampleTool);
      service.unregister('custom_tool');
      expect(service.has('custom_tool')).toBe(false);
    });

    it('should throw for unknown tool', () => {
      expect(() => service.unregister('ghost')).toThrow('not registered');
    });
  });

  describe('getAvailableForAgent()', () => {
    it('should return tools that are available and registered', () => {
      const tools = service.getAvailableForAgent(['web_search', 'non_existent']);
      expect(tools).toHaveLength(1);
      expect(tools[0].id).toBe('web_search');
    });
  });
});
