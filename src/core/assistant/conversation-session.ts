import type {
  AssistantContext,
  AssistantResponse,
} from "../../ports/assistant.js";
import type {
  ConversationCompactorPort,
  ConversationHistoryConfig,
  ConversationResponderPort,
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";

export interface ConversationSessionDependencies {
  compactor: ConversationCompactorPort;
  history: ConversationHistoryConfig;
  onCompacted?: () => void;
  responder: ConversationResponderPort;
}

export interface ConversationSession {
  commit(
    input: string,
    response: AssistantResponse,
    context: AssistantContext,
  ): Promise<void>;
  respond(input: string, context: AssistantContext): Promise<AssistantResponse>;
  snapshot(): ConversationState;
}

export function createConversationSession(
  dependencies: ConversationSessionDependencies,
): ConversationSession {
  let state: ConversationState = {
    recentTurns: [],
  };
  return {
    async commit(input, response, context) {
      const candidateState = appendConversationTurn(state, input, response);
      const compaction = await compactConversationIfNeeded(
        candidateState,
        dependencies,
        context,
      );
      state = cloneConversationState(compaction.state);
      if (compaction.compacted) dependencies.onCompacted?.();
    },
    respond: (input, context) =>
      dependencies.responder.respond(
        input,
        cloneConversationState(state),
        context,
      ),
    snapshot: () => cloneConversationState(state),
  };
}

async function compactConversationIfNeeded(
  state: ConversationState,
  dependencies: ConversationSessionDependencies,
  context: AssistantContext,
): Promise<{ compacted: boolean; state: ConversationState }> {
  if (
    countUserTurns(state.recentTurns) <
    dependencies.history.maxTurnsBeforeCompaction
  ) {
    return { compacted: false, state };
  }

  return {
    compacted: true,
    state: await dependencies.compactor.compact(
      cloneConversationState(state),
      context,
    ),
  };
}

function appendConversationTurn(
  state: ConversationState,
  input: string,
  response: AssistantResponse,
): ConversationState {
  return {
    ...(state.summary ? { summary: state.summary } : {}),
    recentTurns: [
      ...state.recentTurns.map((turn) => ({ ...turn })),
      { content: input, role: "user" },
      { content: response.text, role: "assistant" },
    ],
  };
}

function countUserTurns(turns: ConversationTurn[]): number {
  return turns.filter((turn) => turn.role === "user").length;
}

function cloneConversationState(state: ConversationState): ConversationState {
  return {
    ...(state.summary ? { summary: state.summary } : {}),
    recentTurns: state.recentTurns.map((turn) => ({ ...turn })),
  };
}
