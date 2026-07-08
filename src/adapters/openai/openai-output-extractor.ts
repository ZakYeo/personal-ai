import { OpenAIIntentError } from "./openai-intent-error.js";

interface ExtractOpenAIOutputTextMessages {
  missingMessage: string;
  notObjectMessage: string;
}

export function extractOpenAIOutputText(
  value: unknown,
  messages: ExtractOpenAIOutputTextMessages = {
    missingMessage: "OpenAI intent response did not include output text.",
    notObjectMessage: "OpenAI intent response body must be an object.",
  },
): string {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(messages.notObjectMessage);
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (Array.isArray(value.output)) {
    for (const outputItem of value.output) {
      const text = extractContentText(outputItem);

      if (text) {
        return text;
      }
    }
  }

  throw new OpenAIIntentError(messages.missingMessage);
}

function extractContentText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return undefined;
  }

  for (const contentItem of value.content) {
    if (isRecord(contentItem) && typeof contentItem.text === "string") {
      return contentItem.text;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
