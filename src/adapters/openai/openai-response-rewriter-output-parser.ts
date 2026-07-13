import { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";
import { isRecord } from "../parsing.js";
import { parseOpenAIStructuredOutput } from "./openai-structured-output-parser.js";

export function parseOpenAIResponseRewrite(value: string): { text: string } {
  const parsed = parseOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIResponseRewriterError(message, undefined, responseBody, {
        cause,
      }),
    invalidJsonMessage: "OpenAI response rewrite was not valid JSON.",
  });

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
