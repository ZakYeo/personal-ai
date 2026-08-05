import type {
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";
import type {
  OpenAIResponsesAssistantMessage,
  OpenAIResponsesPromptMessage,
} from "./openai-responses-request.js";

type OpenAIConversationStateMessage =
  | OpenAIResponsesAssistantMessage
  | OpenAIResponsesPromptMessage;

export function formatOpenAIConversationStateMessages(
  state: ConversationState,
): OpenAIConversationStateMessage[] {
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
): OpenAIConversationStateMessage {
  if (role === "assistant") {
    return { content: text, role };
  }

  return {
    content: text,
    role,
  };
}
