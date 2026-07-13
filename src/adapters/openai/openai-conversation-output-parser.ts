import { OpenAIConversationError } from "./openai-conversation-error.js";
import { isRecord } from "../parsing.js";
import { parseOpenAIStructuredOutput } from "./openai-structured-output-parser.js";

export function parseOpenAIConversationResponse(value: string): {
  expectsFollowUp: boolean;
  text: string;
} {
  const parsed = parseConversationOutput(value);

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
  const parsed = parseConversationOutput(value);

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

  return parsed.summary;
}

function parseConversationOutput(value: string): unknown {
  return parseOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIConversationError(message, undefined, responseBody, { cause }),
    invalidJsonMessage: "OpenAI conversation response was not valid JSON.",
  });
}
