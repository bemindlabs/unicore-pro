import { Injectable } from '@nestjs/common';
import {
  PromptValidationResult,
  PromptValidationError,
  PromptValidationWarning,
  PromptPreviewOptions,
} from '../types/agent.types';

/** Regex to match {{ variableName }} or {{variableName}} placeholders. */
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Rough token estimator: ~4 chars per token (GPT-4 approximation). */
const CHARS_PER_TOKEN = 4;

/** Hard upper bound we warn about (GPT-4 context ≈ 128 k tokens). */
const TOKEN_WARN_THRESHOLD = 4_096;

/**
 * Service for validating and previewing system prompts authored in the
 * builder wizard's step 2 (Prompt).
 *
 * Variable syntax: `{{ variableName }}` — double-curly-brace, optional spaces.
 */
@Injectable()
export class PromptEditorService {
  // ── Validation ────────────────────────────────────────────────────────────

  validate(prompt: string): PromptValidationResult {
    const errors: PromptValidationError[] = [];
    const warnings: PromptValidationWarning[] = [];

    // Empty prompt is a hard error.
    if (!prompt || prompt.trim().length === 0) {
      errors.push({
        code: 'PROMPT_EMPTY',
        message: 'System prompt must not be empty.',
      });
      return {
        valid: false,
        errors,
        warnings,
        extractedVariables: [],
        estimatedTokenCount: 0,
      };
    }

    // Detect unclosed variable braces e.g. {{ foo }
    const unclosed = this.detectUnclosedBraces(prompt);
    for (const { line, column, raw } of unclosed) {
      errors.push({
        code: 'UNCLOSED_VARIABLE',
        message: `Unclosed variable placeholder: "${raw}"`,
        position: { line, column },
      });
    }

    // Extract valid variable names.
    const extractedVariables = this.extractVariables(prompt);

    // Warn about duplicate variable declarations (same name used more than once
    // is fine, but list unique names so the UI can surface them).
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const v of extractedVariables) {
      if (seen.has(v)) duplicates.add(v);
      seen.add(v);
    }

    // Token count estimate.
    const estimatedTokenCount = Math.ceil(prompt.length / CHARS_PER_TOKEN);
    if (estimatedTokenCount > TOKEN_WARN_THRESHOLD) {
      warnings.push({
        code: 'PROMPT_TOO_LONG',
        message: `Prompt is approximately ${estimatedTokenCount} tokens — consider shortening it to leave room for conversation history.`,
      });
    }

    // Warn if no instruction-style language detected.
    const hasInstructionKeyword = /\b(you are|your role|your task|respond|always|never|must)\b/i.test(
      prompt,
    );
    if (!hasInstructionKeyword) {
      warnings.push({
        code: 'NO_INSTRUCTIONS',
        message:
          'The prompt does not appear to contain explicit behavioural instructions. Consider adding directives like "You are…" or "Always…".',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      extractedVariables: [...new Set(extractedVariables)],
      estimatedTokenCount,
    };
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  /**
   * Render the system prompt with variable placeholders substituted.
   * Missing variables are left as-is so the UI can highlight them.
   */
  renderPreview(prompt: string, options: PromptPreviewOptions): string {
    let rendered = prompt;

    // Replace all known variables.
    rendered = rendered.replace(VARIABLE_REGEX, (_match, varName: string) => {
      return options.variables[varName] ?? _match;
    });

    // Truncate if requested.
    if (options.maxLength && rendered.length > options.maxLength) {
      rendered = rendered.slice(0, options.maxLength) + '…';
    }

    return rendered;
  }

  /**
   * Extract the unique set of variable names from a prompt template.
   */
  extractVariables(prompt: string): string[] {
    const names: string[] = [];
    const regex = new RegExp(VARIABLE_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(prompt)) !== null) {
      names.push(match[1]);
    }

    return [...new Set(names)];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private detectUnclosedBraces(
    prompt: string,
  ): Array<{ line: number; column: number; raw: string }> {
    const issues: Array<{ line: number; column: number; raw: string }> = [];
    const lines = prompt.split('\n');

    lines.forEach((lineText, lineIndex) => {
      // Find single-open-brace patterns that are not part of {{ … }}
      const singleOpenRegex = /\{(?!\{)[^}]*\}?/g;
      let m: RegExpExecArray | null;
      while ((m = singleOpenRegex.exec(lineText)) !== null) {
        if (!m[0].endsWith('}')) {
          issues.push({
            line: lineIndex + 1,
            column: m.index + 1,
            raw: m[0],
          });
        }
      }

      // Find {{ without matching }}
      const halfOpen = /\{\{(?:(?!\}\}).)*$/g;
      while ((m = halfOpen.exec(lineText)) !== null) {
        issues.push({
          line: lineIndex + 1,
          column: m.index + 1,
          raw: m[0],
        });
      }
    });

    return issues;
  }
}
