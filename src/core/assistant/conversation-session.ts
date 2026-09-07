import { assertConversationSummaryWithinLimit } from "../../application/model-output-policy.js";
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
  respond(
    input: string,
    state: ConversationState,
    context: AssistantContext,
  ): Promise<AssistantResponse>;
  snapshot(): ConversationState;
}

export function createConversationSession(
  dependencies: ConversationSessionDependencies,
): ConversationSession {
  let state = freezeConversationState({ recentTurns: [] });
  let retryCompaction = false;
  return {
    async commit(input, response, context) {
      const candidateState = freezeConversationState(
        appendConversationTurn(state, input, response),
      );
      let compaction: { compacted: boolean; state: ConversationState };
      try {
        compaction = await compactConversationIfNeeded(
          candidateState,
          dependencies,
          context,
          retryCompaction,
        );
      } catch (error) {
        const fallback = boundFallbackHistory(candidateState);
        state = freezeConversationState(fallback.state);
        retryCompaction = true;
        if (fallback.truncated) {
          throw new AggregateError(
            [error],
            "Conversation compaction failed; fallback history was trimmed to its retention bounds.",
            { cause: error },
          );
        }
        throw error;
      }
      state = freezeConversationState(compaction.state);
      retryCompaction = false;
      if (compaction.compacted) dependencies.onCompacted?.();
    },
    respond: (input, snapshot, context) =>
      dependencies.responder.respond(input, snapshot, context),
    snapshot: () => state,
  };
}

async function compactConversationIfNeeded(
  state: ConversationState,
  dependencies: ConversationSessionDependencies,
  context: AssistantContext,
  retry: boolean,
): Promise<{ compacted: boolean; state: ConversationState }> {
  if (
    !retry &&
    countUserTurns(state.recentTurns) <
      dependencies.history.maxTurnsBeforeCompaction
  ) {
    return { compacted: false, state };
  }

  const summary = await dependencies.compactor.compact(state, context);
  assertConversationSummaryWithinLimit(summary);

  return {
    compacted: true,
    state: { recentTurns: [], summary },
  };
}

function boundFallbackHistory(state: ConversationState): {
  state: ConversationState;
  truncated: boolean;
} {
  const recentTurns = state.recentTurns.slice(-20).map((turn) => ({
    ...turn,
    content:
      turn.content.length > 16_000
        ? `${turn.content.slice(0, 15_999)}…`
        : turn.content,
  }));
  let characters = recentTurns.reduce(
    (sum, turn) => sum + turn.content.length,
    0,
  );
  while (characters > 32_000 && recentTurns.length > 2) {
    characters -= recentTurns
      .splice(0, 2)
      .reduce((sum, turn) => sum + turn.content.length, 0);
  }
  return {
    state: { ...state, recentTurns },
    truncated:
      recentTurns.length !== state.recentTurns.length ||
      state.recentTurns.some((turn) => turn.content.length > 16_000),
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

function countUserTurns(turns: readonly ConversationTurn[]): number {
  return turns.filter((turn) => turn.role === "user").length;
}

function freezeConversationState(state: ConversationState): ConversationState {
  return Object.freeze({
    ...(state.summary ? { summary: state.summary } : {}),
    recentTurns: Object.freeze(
      state.recentTurns.map((turn) => Object.freeze({ ...turn })),
    ),
  });
}
