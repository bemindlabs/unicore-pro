import { PromptEditorService } from '../services/prompt-editor.service';

describe('PromptEditorService', () => {
  let service: PromptEditorService;

  beforeEach(() => {
    service = new PromptEditorService();
  });

  describe('validate()', () => {
    it('should pass a valid prompt', () => {
      const result = service.validate(
        'You are a helpful assistant. Always respond in {{ language }}.',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail an empty prompt', () => {
      const result = service.validate('');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('PROMPT_EMPTY');
    });

    it('should fail a whitespace-only prompt', () => {
      const result = service.validate('   \n  ');
      expect(result.valid).toBe(false);
    });

    it('should warn about very long prompts', () => {
      const longPrompt =
        'You are a helpful assistant. ' +
        'Always respond politely. '.repeat(800);
      const result = service.validate(longPrompt);
      // May still be valid but should warn
      expect(result.warnings.some((w) => w.code === 'PROMPT_TOO_LONG')).toBe(true);
    });

    it('should warn when no instructional language is present', () => {
      const result = service.validate('Hello world, this is a prompt.');
      expect(result.warnings.some((w) => w.code === 'NO_INSTRUCTIONS')).toBe(true);
    });

    it('should extract variables from a prompt', () => {
      const result = service.validate(
        'Hello {{ name }}, your role is {{ role }}. Never forget {{ name }}.',
      );
      expect(result.extractedVariables).toEqual(['name', 'role']);
    });

    it('should estimate token count', () => {
      const prompt = 'a'.repeat(400);
      const result = service.validate(prompt);
      expect(result.estimatedTokenCount).toBe(100);
    });
  });

  describe('extractVariables()', () => {
    it('should extract unique variable names', () => {
      const vars = service.extractVariables(
        '{{ a }} and {{ b }} and {{ a }} again.',
      );
      expect(vars).toEqual(['a', 'b']);
    });

    it('should return empty array when no variables', () => {
      const vars = service.extractVariables('No variables here.');
      expect(vars).toHaveLength(0);
    });

    it('should handle variables with spaces around name', () => {
      const vars = service.extractVariables('Hello {{  firstName  }}!');
      expect(vars).toContain('firstName');
    });
  });

  describe('renderPreview()', () => {
    it('should substitute known variables', () => {
      const rendered = service.renderPreview(
        'Hello {{ name }}, you are a {{ role }}.',
        { variables: { name: 'Alice', role: 'developer' } },
      );
      expect(rendered).toBe('Hello Alice, you are a developer.');
    });

    it('should leave unknown variables as-is', () => {
      const rendered = service.renderPreview(
        'Hello {{ name }}, your tier is {{ tier }}.',
        { variables: { name: 'Bob' } },
      );
      expect(rendered).toContain('{{ tier }}');
      expect(rendered).toContain('Bob');
    });

    it('should truncate when maxLength is provided', () => {
      const rendered = service.renderPreview(
        'This is a fairly long prompt string.',
        { variables: {}, maxLength: 10 },
      );
      expect(rendered.length).toBeLessThanOrEqual(11); // 10 + ellipsis char
      expect(rendered.endsWith('…')).toBe(true);
    });
  });
});
