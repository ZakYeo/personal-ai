import { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";

export function parseOpenAIResponseRewrite(value: string): { text: string } {
  const parsed = parseOutputText(value);

  if (!isRecord(parsed)) {
    throw new OpenAIResponseRewriterError(
      "OpenAI response rewrite must be an object.",
    );
  }

  if (typeof parsed.text !== "string" || parsed.text.length === 0) {
    throw new OpenAIResponseRewriterError(
      "OpenAI response rewrite text must be a non-empty string.",
    );
  }

  return {
    text: parsed.text,
  };
}

function parseOutputText(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new OpenAIResponseRewriterError(
      "OpenAI response rewrite was not valid JSON.",
      undefined,
      value,
      { cause: error },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
