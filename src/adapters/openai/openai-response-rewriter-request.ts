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
              "Do not invent events, appointments, dates, providers, availability, or actions.",
              "You may humanize raw ISO dates and times into natural speech, including relative wording when it is helpful and supported by the current date.",
              "For calendar responses, make title-shaped event names conversational when the source text supports it, such as removing owner prefixes and turning role/interview titles into natural phrases, without changing the underlying facts.",
              "For current-year calendar dates, avoid saying the year unless the user needs it for clarity.",
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
