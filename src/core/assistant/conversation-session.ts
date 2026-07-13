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
  responder: ConversationResponderPort;
}

export interface ConversationSession {
  respond(input: string, context: AssistantContext): Promise<AssistantResponse>;
}

export function createConversationSession(
  dependencies: ConversationSessionDependencies,
): ConversationSession {
  let state: ConversationState = {
    recentTurns: [],
  };
  let pendingTurn: Promise<void> = Promise.resolve();

  return {
    respond(input, context) {
      const turn = pendingTurn.then(async () => {
        const response = await dependencies.responder.respond(
          input,
          cloneConversationState(state),
          context,
        );
        const candidateState = appendConversationTurn(state, input, response);
        const nextState = await compactConversationIfNeeded(
          candidateState,
          dependencies,
          context,
        );

        state = cloneConversationState(nextState);

        return response;
      });

      pendingTurn = turn.then(
        () => {},
        () => {},
      );

      return turn;
    },
  };
}

async function compactConversationIfNeeded(
  state: ConversationState,
  dependencies: ConversationSessionDependencies,
  context: AssistantContext,
): Promise<ConversationState> {
  if (
    countUserTurns(state.recentTurns) <
    dependencies.history.maxTurnsBeforeCompaction
  ) {
    return state;
  }

  return dependencies.compactor.compact(cloneConversationState(state), context);
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
