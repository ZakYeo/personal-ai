import { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";
import { isRecord } from "../parsing.js";
import { parseValidatedOpenAIStructuredOutput } from "./openai-structured-output-parser.js";
import { isOpenAISpokenTextSafe } from "./openai-spoken-style.js";

export function parseOpenAIResponseRewrite(value: string): { text: string } {
  return parseValidatedOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIResponseRewriterError(message, undefined, responseBody, {
        cause,
      }),
    invalidJsonMessage: "OpenAI response rewrite was not valid JSON.",
    invalidOutputMessage: "OpenAI response rewrite was invalid.",
    validate: parseResponseRewrite,
  });
}

function parseResponseRewrite(parsed: unknown): { text: string } {
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
  if (!isOpenAISpokenTextSafe(parsed.text)) {
    throw new OpenAIResponseRewriterError(
      "OpenAI response rewrite text must be suitable for spoken delivery.",
    );
  }

  return {
    text: parsed.text,
  };
}
