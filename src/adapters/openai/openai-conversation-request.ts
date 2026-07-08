import type {
  AssistantContext,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";

export function createOpenAIConversationRequestBody(
  input: string,
  state: ConversationState,
  context: AssistantContext,
  config: OpenAIIntentConfig,
) {
  return {
    input: [
      {
        content: [
          {
            text: [
              `You are ${context.config.assistant.name}, a concise personal voice assistant.`,
              "Answer the user's general question conversationally.",
              "Do not claim to execute commands or access unavailable tools.",
              "Return only JSON matching the supplied schema.",
              formatConversationState(state),
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      {
        content: [
          {
            text: input,
            type: "input_text",
          },
        ],
        role: "user",
      },
    ],
    model: config.model,
    text: {
      format: {
        name: "conversation_response",
        schema: conversationResponseSchema,
        strict: true,
        type: "json_schema",
      },
    },
  };
}

export function createOpenAIConversationCompactionRequestBody(
  state: ConversationState,
  context: AssistantContext,
  config: OpenAIIntentConfig,
) {
  return {
    input: [
      {
        content: [
          {
            text: [
              `Summarize ${context.config.assistant.name}'s chat history for future turns.`,
              "Preserve stable user preferences, facts, open questions, and useful context.",
              "Do not include secrets, credentials, stack traces, or provider diagnostics.",
              "Return only JSON matching the supplied schema.",
              formatConversationState(state),
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
    ],
    model: config.model,
    text: {
      format: {
        name: "conversation_summary",
        schema: conversationSummarySchema,
        strict: true,
        type: "json_schema",
      },
    },
  };
}

const conversationResponseSchema = {
  additionalProperties: false,
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  type: "object",
};

const conversationSummarySchema = {
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  type: "object",
};

function formatConversationState(state: ConversationState): string {
  const summary = state.summary
    ? `Summary:\n${state.summary}`
    : "Summary: none";
  const recentTurns =
    state.recentTurns.length === 0
      ? "Recent turns: none"
      : `Recent turns:\n${state.recentTurns
          .map((turn) => `${turn.role}: ${turn.content}`)
          .join("\n")}`;

  return `${summary}\n${recentTurns}`;
}
