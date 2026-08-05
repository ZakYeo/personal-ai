import type { AssistantContext } from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import {
  formatOpenAICapabilities,
  type OpenAIIntentCapability,
} from "./openai-intent-request.js";
import {
  createOpenAIReasoningRequestConfig,
  type OpenAIResponsesConfig,
} from "./openai-responses-config.js";
import { openAISpokenStyleInstruction } from "./openai-spoken-style.js";
import { formatOpenAIConversationStateMessages } from "./openai-conversation-state.js";
import type { OpenAIResponsesRequestBody } from "./openai-responses-request.js";

export function createOpenAIConversationRequestBody(
  input: string,
  state: ConversationState,
  context: AssistantContext,
  config: OpenAIResponsesConfig,
  capabilityCatalog: readonly OpenAIIntentCapability[] = [],
) {
  return {
    input: [
      {
        content: [
          {
            text: [
              `You are ${context.config.assistant.name}, a concise personal voice assistant.`,
              "Answer the user's general question conversationally.",
              "Your response text will be spoken aloud, so keep it brief and use natural sentences.",
              openAISpokenStyleInstruction,
              "Avoid bullets, numbered lists, semicolon-delimited lists, parentheses for asides, and code-like wording unless the user explicitly asks for technical details.",
              "Do not mention internal capability names such as alarm.list or calendar.search_events in normal user-facing answers.",
              "Do not claim to execute commands or access unavailable tools.",
              `Current time: ${context.clock.now().toISOString()}.`,
              `Assistant time zone: ${context.config.assistant.timeZone}.`,
              `The assistant's enabled capabilities are:\n${formatOpenAICapabilities(capabilityCatalog)}`,
              "Set expectsFollowUp to true when your reply asks a direct question addressed to the user and you intend to receive their answer, including a reciprocal conversational question such as asking how the user is doing.",
              "Set expectsFollowUp to false for rhetorical questions and replies that do not directly request an answer. Do not append a generic invitation, offer more help, or ask what the user wants next.",
              "Return only JSON matching the supplied schema.",
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      ...formatOpenAIConversationStateMessages(state),
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
    ...createOpenAIReasoningRequestConfig(config),
    text: {
      format: {
        name: "conversation_response",
        schema: conversationResponseSchema,
        strict: true,
        type: "json_schema",
      },
    },
  } satisfies OpenAIResponsesRequestBody;
}

export function createOpenAIConversationCompactionRequestBody(
  state: ConversationState,
  context: AssistantContext,
  config: OpenAIResponsesConfig,
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
      ...formatOpenAIConversationStateMessages(state),
    ],
    model: config.model,
    ...createOpenAIReasoningRequestConfig(config),
    text: {
      format: {
        name: "conversation_summary",
        schema: conversationSummarySchema,
        strict: true,
        type: "json_schema",
      },
    },
  } satisfies OpenAIResponsesRequestBody;
}

const conversationResponseSchema = {
  additionalProperties: false,
  properties: {
    expectsFollowUp: {
      description:
        "True when the reply asks a direct question addressed to the user and intends to receive their answer, including a reciprocal conversational question; false for rhetorical questions or replies that do not request an answer.",
      type: "boolean",
    },
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
