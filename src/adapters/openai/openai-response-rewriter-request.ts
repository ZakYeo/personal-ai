import type { AssistantContext } from "../../ports/assistant.js";
import type { ResponseRewriteRequest } from "../../ports/response-rewriter.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";

export function createOpenAIResponseRewriteRequestBody(
  request: ResponseRewriteRequest,
  context: AssistantContext,
  config: OpenAIResponsesConfig,
) {
  return {
    input: [
      {
        content: [
          {
            text: [
              `You are ${context.config.assistant.name}, a concise personal voice assistant.`,
              "Rewrite the provided assistant command response for spoken delivery.",
              "Preserve every factual claim exactly: event titles, dates, counts, names, IDs, and whether something was found.",
              "The response may contain opaque protected-fact tokens. Preserve every token exactly and with the same number of occurrences; never rename, omit, duplicate, or explain a token.",
              "Do not invent events, appointments, dates, providers, availability, or actions.",
              "Core restores protected tokens using approved exact or relative-date renderings after your rewrite; humanize only the surrounding connective wording.",
              "Avoid bullets, numbered lists, semicolon-delimited lists, code-like wording, and internal capability names.",
              "Return only JSON matching the supplied schema.",
              `Current time: ${context.clock.now().toISOString()}.`,
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      {
        content: [
          {
            text: JSON.stringify({
              capability: request.capability,
              originalResponseText: request.response.text,
              originalUserText: request.originalText,
              protectedFacts: request.protectedFacts ?? [],
              status: request.response.status,
            }),
            type: "input_text",
          },
        ],
        role: "user",
      },
    ],
    model: config.model,
    text: {
      format: {
        name: "response_rewrite",
        schema: responseRewriteSchema,
        strict: true,
        type: "json_schema",
      },
    },
  };
}

const responseRewriteSchema = {
  additionalProperties: false,
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  type: "object",
};
