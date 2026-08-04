import type { CapabilityCatalogEntry } from "../../ports/capability-catalog.js";

export function createOpenAIIntentOutputSchema(
  capabilityCatalog: readonly CapabilityCatalogEntry[],
) {
  const capabilityNames = capabilityCatalog.map(
    ({ capability }) => capability.name,
  );
  const command = {
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
    type: "object",
  } as const;
  const response = {
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
    type: "object",
  } as const;
  const variants = [
    variant("command", { command: { $ref: "#/$defs/command" } }),
    variant("plan", { plan: { $ref: "#/$defs/plan" } }),
    variant("conversation"),
    ...(capabilityNames.length === 0
      ? []
      : [
          variant("clarification", {
            clarificationCapability: {
              enum: capabilityNames,
              type: "string",
            },
            response: { $ref: "#/$defs/response" },
          }),
        ]),
    variant("rephrase", { response: { $ref: "#/$defs/response" } }),
    variant("replacement"),
    variant("unknown", { response: { $ref: "#/$defs/response" } }),
    variant("unsupported", { response: { $ref: "#/$defs/response" } }),
  ];

  return {
    $defs: {
      command,
      plan: {
        additionalProperties: false,
        properties: {
          commands: {
            items: { $ref: "#/$defs/command" },
            maxItems: 3,
            minItems: 1,
            type: "array",
          },
        },
        required: ["commands"],
        type: "object",
      },
      response,
    },
    additionalProperties: false,
    properties: {
      interpretation: { anyOf: variants },
    },
    required: ["interpretation"],
    type: "object",
  };
}

function variant(kind: string, properties: Record<string, unknown> = {}) {
  return {
    additionalProperties: false,
    properties: {
      kind: { enum: [kind], type: "string" },
      ...properties,
    },
    required: ["kind", ...Object.keys(properties)],
    type: "object",
  };
}
