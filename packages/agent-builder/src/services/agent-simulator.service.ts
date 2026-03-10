import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  CustomAgent,
  SimulatorMessage,
  SimulationResult,
  MessageRole,
} from '../types/agent.types';
import { AgentStorageService } from './agent-storage.service';
import { ToolRegistryService } from './tool-registry.service';
import { PromptEditorService } from './prompt-editor.service';

export interface SimulationRequest {
  agentId: string;
  messages: Array<{ role: MessageRole; content: string }>;
  /** Optional variable substitutions for system prompt placeholders. */
  promptVariables?: Record<string, string>;
}

export interface ConversationSession {
  sessionId: string;
  agentId: string;
  messages: SimulatorMessage[];
  startedAt: Date;
  lastActivityAt: Date;
}

/**
 * Simulates agent conversations for testing purposes inside wizard step 5.
 *
 * The simulator does NOT call a real LLM — it produces deterministic mock
 * responses so developers can verify tool integration, prompt rendering, and
 * conversation flow without incurring LLM API costs.
 */
@Injectable()
export class AgentSimulatorService {
  private readonly sessions = new Map<string, ConversationSession>();

  constructor(
    private readonly storage: AgentStorageService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly promptEditor: PromptEditorService,
  ) {}

  // ── Session management ────────────────────────────────────────────────────

  async createSession(agentId: string): Promise<ConversationSession> {
    const agent = await this.storage.findById(agentId);
    const systemPrompt = this.promptEditor.renderPreview(
      agent.systemPrompt,
      { variables: {} },
    );

    const systemMessage: SimulatorMessage = {
      id: uuidv4(),
      role: 'system',
      content: systemPrompt,
      createdAt: new Date(),
    };

    const now = new Date();
    const session: ConversationSession = {
      sessionId: uuidv4(),
      agentId,
      messages: [systemMessage],
      startedAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(session.sessionId, session);
    return { ...session };
  }

  getSession(sessionId: string): ConversationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Simulation session "${sessionId}" not found.`);
    }
    return { ...session, messages: [...session.messages] };
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ── Simulation ────────────────────────────────────────────────────────────

  /**
   * Run a full simulation for an agent given a list of user messages.
   * Returns a SimulationResult with mock assistant replies and tool calls.
   */
  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    const startTime = Date.now();
    const agent = await this.storage.findById(request.agentId);

    const renderedSystemPrompt = this.promptEditor.renderPreview(
      agent.systemPrompt,
      { variables: request.promptVariables ?? {} },
    );

    const simulatedMessages: SimulatorMessage[] = [];
    const errors: string[] = [];
    let tokensUsed = 0;
    let toolCallsCount = 0;

    // System message
    simulatedMessages.push({
      id: uuidv4(),
      role: 'system',
      content: renderedSystemPrompt,
      createdAt: new Date(),
    });

    // Process each user message and generate mock responses
    for (const userMsg of request.messages) {
      const userSimMsg: SimulatorMessage = {
        id: uuidv4(),
        role: userMsg.role,
        content: userMsg.content,
        createdAt: new Date(),
      };
      simulatedMessages.push(userSimMsg);

      tokensUsed += Math.ceil(userMsg.content.length / 4);

      if (userMsg.role === 'user') {
        // Simulate tool call if agent has tools and message hints at needing one
        const shouldCallTool =
          agent.tools.length > 0 &&
          this.messageImpliesToolUse(userMsg.content);

        if (shouldCallTool) {
          const tool = agent.tools[0];
          const toolResult = await this.mockToolCall(tool.id, userMsg.content);
          toolCallsCount++;

          simulatedMessages.push({
            id: uuidv4(),
            role: 'tool',
            content: JSON.stringify(toolResult),
            toolCallId: uuidv4(),
            toolName: tool.name,
            createdAt: new Date(),
          });
        }

        // Mock assistant reply
        const assistantReply = this.generateMockReply(
          agent,
          userMsg.content,
          shouldCallTool,
        );

        simulatedMessages.push({
          id: uuidv4(),
          role: 'assistant',
          content: assistantReply,
          createdAt: new Date(),
        });

        tokensUsed += Math.ceil(assistantReply.length / 4);
      }
    }

    return {
      success: errors.length === 0,
      messages: simulatedMessages,
      tokensUsed,
      latencyMs: Date.now() - startTime,
      toolCallsCount,
      errors,
    };
  }

  /**
   * Add a single turn to an existing session (interactive testing).
   */
  async addTurn(
    sessionId: string,
    userContent: string,
  ): Promise<SimulatorMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Simulation session "${sessionId}" not found.`);
    }

    const agent = await this.storage.findById(session.agentId);
    const added: SimulatorMessage[] = [];

    const userMsg: SimulatorMessage = {
      id: uuidv4(),
      role: 'user',
      content: userContent,
      createdAt: new Date(),
    };
    session.messages.push(userMsg);
    added.push(userMsg);

    // Tool call simulation
    const shouldCallTool =
      agent.tools.length > 0 && this.messageImpliesToolUse(userContent);

    if (shouldCallTool) {
      const tool = agent.tools[0];
      const toolResult = await this.mockToolCall(tool.id, userContent);

      const toolMsg: SimulatorMessage = {
        id: uuidv4(),
        role: 'tool',
        content: JSON.stringify(toolResult),
        toolCallId: uuidv4(),
        toolName: tool.name,
        createdAt: new Date(),
      };
      session.messages.push(toolMsg);
      added.push(toolMsg);
    }

    const reply = this.generateMockReply(agent, userContent, shouldCallTool);
    const assistantMsg: SimulatorMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: reply,
      createdAt: new Date(),
    };
    session.messages.push(assistantMsg);
    added.push(assistantMsg);

    session.lastActivityAt = new Date();
    return added;
  }

  // ── Mock helpers ──────────────────────────────────────────────────────────

  private messageImpliesToolUse(content: string): boolean {
    const keywords = [
      'search', 'look up', 'find', 'fetch', 'get', 'query', 'email',
      'send', 'create', 'write', 'read', 'track', 'analyse', 'analyze',
    ];
    const lower = content.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  }

  private async mockToolCall(
    toolId: string,
    _context: string,
  ): Promise<Record<string, unknown>> {
    // Simulate a brief async operation
    await new Promise((r) => setTimeout(r, 0));

    return {
      toolId,
      status: 'success',
      result: `[MOCK] Tool "${toolId}" executed successfully.`,
      timestamp: new Date().toISOString(),
    };
  }

  private generateMockReply(
    agent: CustomAgent,
    userContent: string,
    usedTool: boolean,
  ): string {
    const toolNote = usedTool
      ? ' I used one of my tools to assist with this.'
      : '';

    return (
      `[SIMULATOR] Hi! I'm ${agent.name} (v${agent.version}).` +
      ` You said: "${userContent.slice(0, 80)}${userContent.length > 80 ? '…' : ''}".` +
      `${toolNote} This is a simulated response for testing purposes.`
    );
  }
}
