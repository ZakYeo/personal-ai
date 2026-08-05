import type {
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";
import type { OpenAIResponsesPlainTextMessage } from "./openai-responses-request.js";

export function formatOpenAIConversationStateMessages(
  state: ConversationState,
): OpenAIResponsesPlainTextMessage[] {
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

function createInputMessage(
  role: ConversationTurn["role"],
  text: string,
): OpenAIResponsesPlainTextMessage {
  return { content: text, role };
}
