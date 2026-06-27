import type {
  AssistantContext,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type { FeatureCapability } from "../../ports/feature.js";

export interface OpenAIIntentCapability {
  featureId: string;
  featureName: string;
  capability: FeatureCapability;
}

export function createOpenAIIntentRequestBody(
  text: string,
  context: AssistantContext,
  config: OpenAIIntentConfig,
  capabilityCatalog: OpenAIIntentCapability[],
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
              "Use kind command with command populated and response null when a capability matches.",
              "Use kind response with command null and response populated when no capability matches.",
              `Enabled capabilities:\n${formatCapabilities(capabilityCatalog)}`,
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
        schema: intentInterpretationSchema,
        strict: true,
        type: "json_schema",
      },
    },
  };
}

const intentInterpretationSchema = {
  additionalProperties: false,
  properties: {
    command: {
      additionalProperties: false,
      properties: {
        capability: { type: "string" },
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
      enum: ["command", "response"],
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

function formatCapabilities(catalog: OpenAIIntentCapability[]): string {
  if (catalog.length === 0) {
    return "No capabilities are enabled.";
  }

  return catalog
    .map(({ capability, featureId, featureName }) => {
      const parameters = capability.parameters ?? {};
      const parameterText = Object.entries(parameters)
        .map(([name, parameter]) => {
          const constraints = [
            parameter.required ? "required" : "optional",
            parameter.minimum === undefined
              ? undefined
              : `minimum ${parameter.minimum}`,
            parameter.positive ? "positive" : undefined,
          ].filter(
            (constraint): constraint is string => constraint !== undefined,
          );

          return `${name}: ${parameter.type}${constraints.length > 0 ? ` (${constraints.join(", ")})` : ""}`;
        })
        .join("; ");

      return `${capability.name} from ${featureId} (${featureName}); risk ${capability.risk}; parameters ${parameterText || "none"}`;
    })
    .join("\n");
}
