import type {
  AssistantContext,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type {
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";
import {
  formatOpenAICapabilities,
  type OpenAIIntentCapability,
} from "./openai-intent-request.js";

export function createOpenAIConversationRequestBody(
  input: string,
  state: ConversationState,
  context: AssistantContext,
  config: OpenAIIntentConfig,
  capabilityCatalog: OpenAIIntentCapability[] = [],
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
              `The assistant's enabled capabilities are:\n${formatOpenAICapabilities(capabilityCatalog)}`,
              "Set expectsFollowUp to true only when your reply directly asks the user for more input.",
              "Return only JSON matching the supplied schema.",
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      ...formatConversationStateMessages(state),
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
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      ...formatConversationStateMessages(state),
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
    expectsFollowUp: { type: "boolean" },
    text: { type: "string" },
  },
  required: ["text", "expectsFollowUp"],
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

function formatConversationStateMessages(state: ConversationState) {
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
    content: [
      {
        text,
        type: "input_text",
      },
    ],
    role,
  };
}
