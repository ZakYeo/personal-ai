import type { CapabilityCatalogEntry } from "../../ports/capability-catalog.js";
import {
  listOpenAIIntentOutputVariants,
  type OpenAIIntentOutputField,
  type OpenAIIntentOutputKind,
} from "./openai-intent-output-contract.js";

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
  const variants = listOpenAIIntentOutputVariants(
    capabilityNames.length > 0,
  ).map(([kind, variant]) =>
    createVariantSchema(kind, variant.fields, capabilityNames),
  );

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

function createVariantSchema(
  kind: OpenAIIntentOutputKind,
  fields: readonly OpenAIIntentOutputField[],
  capabilityNames: readonly string[],
) {
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map((field) => [
        field,
        createVariantPropertySchema(field, kind, capabilityNames),
      ]),
    ),
    required: fields,
    type: "object",
  };
}

function createVariantPropertySchema(
  field: OpenAIIntentOutputField,
  kind: OpenAIIntentOutputKind,
  capabilityNames: readonly string[],
): unknown {
  if (field === "kind") {
    return { enum: [kind], type: "string" };
  }
  if (field === "command") {
    return { $ref: "#/$defs/command" };
  }
  if (field === "plan") {
    return { $ref: "#/$defs/plan" };
  }
  if (field === "clarificationCapability") {
    return { enum: capabilityNames, type: "string" };
  }
  return { $ref: "#/$defs/response" };
}
