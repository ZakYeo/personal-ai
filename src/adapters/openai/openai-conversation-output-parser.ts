import { modelOutputLimits } from "../../application/model-output-policy.js";
import { OpenAIConversationError } from "./openai-conversation-error.js";
import { isRecord } from "../parsing.js";
import { parseValidatedOpenAIStructuredOutput } from "./openai-structured-output-parser.js";
import { isOpenAISpokenTextSafe } from "./openai-spoken-style.js";

export function parseOpenAIConversationResponse(value: string): {
  expectsFollowUp: boolean;
  text: string;
} {
  return parseConversationOutput(value, parseConversationResponse);
}

function parseConversationResponse(parsed: unknown): {
  expectsFollowUp: boolean;
  text: string;
} {
  if (!isRecord(parsed)) {
    throw new OpenAIConversationError(
      "OpenAI conversation response must be an object.",
    );
  }

  if (typeof parsed.text !== "string" || parsed.text.length === 0) {
    throw new OpenAIConversationError(
      "OpenAI conversation response text must be a non-empty string.",
    );
  }
  if (parsed.text.length > modelOutputLimits.responseCharacters) {
    throw new OpenAIConversationError(
      "OpenAI conversation response text exceeded the application limit.",
    );
  }
  if (!isOpenAISpokenTextSafe(parsed.text)) {
    throw new OpenAIConversationError(
      "OpenAI conversation response text must be suitable for spoken delivery.",
    );
  }

  if (typeof parsed.expectsFollowUp !== "boolean") {
    throw new OpenAIConversationError(
      "OpenAI conversation response expectsFollowUp must be a boolean.",
    );
  }

  return {
    expectsFollowUp: parsed.expectsFollowUp,
    text: parsed.text,
  };
}

export function parseOpenAIConversationSummary(value: string): string {
  return parseConversationOutput(value, parseConversationSummary);
}

function parseConversationSummary(parsed: unknown): string {
  if (!isRecord(parsed)) {
    throw new OpenAIConversationError(
      "OpenAI conversation compaction response must be an object.",
    );
  }

  if (typeof parsed.summary !== "string" || parsed.summary.length === 0) {
    throw new OpenAIConversationError(
      "OpenAI conversation summary must be a non-empty string.",
    );
  }
  if (parsed.summary.length > modelOutputLimits.summaryCharacters) {
    throw new OpenAIConversationError(
      "OpenAI conversation summary exceeded the application limit.",
    );
  }

  return parsed.summary;
}

function parseConversationOutput<T>(
  value: string,
  validate: (parsed: unknown) => T,
): T {
  return parseValidatedOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIConversationError(message, undefined, responseBody, { cause }),
    invalidJsonMessage: "OpenAI conversation response was not valid JSON.",
    invalidOutputMessage: "OpenAI conversation response was invalid.",
    validate,
  });
}
