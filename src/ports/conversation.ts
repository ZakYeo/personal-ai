import type { AssistantContext, AssistantResponse } from "./assistant.js";

export type ConversationRole = "assistant" | "user";

export interface ConversationTurn {
  content: string;
  role: ConversationRole;
}

export interface ConversationState {
  recentTurns: ConversationTurn[];
  summary?: string;
}

export interface ConversationResponderPort {
  respond(
    input: string,
    state: ConversationState,
    context: AssistantContext,
  ): Promise<AssistantResponse>;
}

export interface ConversationCompactorPort {
  compact(
    state: ConversationState,
    context: AssistantContext,
  ): Promise<ConversationState>;
}

export interface ConversationHistoryConfig {
  maxTurnsBeforeCompaction: number;
}
