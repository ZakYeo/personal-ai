import type { AssistantContext } from "../../ports/assistant.js";
import type { CapabilityCatalogEntry } from "../../ports/capability-catalog.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";

export type OpenAIIntentCapability = CapabilityCatalogEntry;

export function createOpenAIIntentRequestBody(
  text: string,
  context: AssistantContext,
  config: OpenAIResponsesConfig,
  capabilityCatalog: readonly OpenAIIntentCapability[],
) {
  return {
    input: [
      {
        content: [
          {
            text: [
              `You are the intent interpreter for ${context.config.assistant.name}.`,
              "Return only JSON matching the supplied schema.",
              "Map requests to enabled assistant capabilities when possible.",
              "Questions about the assistant's enabled capabilities must use the enabled assistant capability that lists them when one is present.",
              "Use kind command with command populated and response null when a capability matches.",
              "When kind is command, command must be populated with the exact enabled capability name, a parameters array, and the user's original text; never set command to null.",
              "Use kind conversation with command and response null for general questions or casual chat.",
              "Use kind unsupported with command null and response populated for command-like requests that no enabled capability can handle.",
              "Use kind unknown with command null and response populated only when the user intent is unclear.",
              `Enabled capabilities:\n${formatOpenAICapabilities(capabilityCatalog)}`,
            ].join(" "),
            type: "input_text",
          },
        ],
        role: "system",
      },
      {
        content: [
          {
            text,
            type: "input_text",
          },
        ],
        role: "user",
      },
    ],
    model: config.model,
    text: {
      format: {
        name: "intent_interpretation",
        schema: createIntentInterpretationSchema(capabilityCatalog),
        strict: true,
        type: "json_schema",
      },
    },
  };
}

function createIntentInterpretationSchema(
  capabilityCatalog: readonly OpenAIIntentCapability[],
) {
  const capabilityNames = capabilityCatalog.map(
    ({ capability }) => capability.name,
  );

  return {
    additionalProperties: false,
    properties: {
      command: {
        additionalProperties: false,
        properties: {
          capability:
            capabilityNames.length === 0
              ? { type: "string" }
              : { enum: capabilityNames, type: "string" },
          parameters: {
            items: {
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                value: { type: ["string", "number", "boolean", "null"] },
              },
              required: ["name", "value"],
              type: "object",
            },
            type: "array",
          },
          rawText: { type: "string" },
        },
        required: ["capability", "parameters", "rawText"],
        type: ["object", "null"],
      },
      kind: {
        enum: ["command", "conversation", "unknown", "unsupported"],
        type: "string",
      },
      response: {
        additionalProperties: false,
        properties: {
          status: {
            enum: [
              "ok",
              "unknown",
              "unsupported",
              "invalid",
              "needs_confirmation",
              "error",
            ],
            type: "string",
          },
          text: { type: "string" },
        },
        required: ["status", "text"],
        type: ["object", "null"],
      },
    },
    required: ["kind", "command", "response"],
    type: "object",
  };
}

export function formatOpenAICapabilities(
  catalog: readonly OpenAIIntentCapability[],
): string {
  if (catalog.length === 0) {
    return "No capabilities are enabled.";
  }

  return catalog
    .map(({ capability, featureId, featureName, parameterText }) => {
      return [
        `${capability.name} from ${featureId} (${featureName})`,
        `summary ${capability.summary ?? "not provided"}`,
        `description ${capability.description ?? "not provided"}`,
        `risk ${capability.risk}`,
        `parameters ${parameterText}`,
      ].join("; ");
    })
    .join("\n");
}
