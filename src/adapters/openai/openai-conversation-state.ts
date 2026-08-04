import type {
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";

export function formatOpenAIConversationStateMessages(
  state: ConversationState,
) {
  return [
    ...(state.summary
      ? [
          createInputMessage(
            "assistant",
            `Earlier conversation summary: ${state.summary}`,
          ),
        ]
      : []),
    ...state.recentTurns.map((turn) =>
      createInputMessage(turn.role, turn.content),
    ),
  ];
}

function createInputMessage(role: ConversationTurn["role"], text: string) {
  return {
    content: [{ text, type: "input_text" }],
    role,
  };
}
