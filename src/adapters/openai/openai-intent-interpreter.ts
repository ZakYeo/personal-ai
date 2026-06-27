import type {
  AssistantCommand,
  AssistantCommandParameters,
  AssistantContext,
  AssistantResponse,
  AssistantResponseStatus,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type { FeatureCapability } from "../../ports/feature.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../../ports/intent.js";

export interface OpenAIIntentCapability {
  featureId: string;
  featureName: string;
  capability: FeatureCapability;
}

interface OpenAIIntentInterpreterOptions {
  capabilityCatalog?: OpenAIIntentCapability[];
  config: OpenAIIntentConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIIntentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenAIIntentError";
  }
}

export class OpenAIIntentInterpreter implements IntentInterpreterPort {
  constructor(private readonly options: OpenAIIntentInterpreterOptions) {}

  async interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation> {
    const apiKey = this.options.env[this.options.config.apiKeyEnv];

    if (!apiKey) {
      throw new OpenAIIntentError(
        `OpenAI API key environment variable ${this.options.config.apiKeyEnv} is not set.`,
      );
    }

    const response = await this.fetchResponse(text, context, apiKey);
    const outputText = extractOutputText(response);
    const parsedOutput = parseOutputText(outputText);

    return parseIntentInterpretation(parsedOutput);
  }

  private async fetchResponse(
    text: string,
    context: AssistantContext,
    apiKey: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.config.timeoutMs,
    );

    try {
      const response = await this.options.fetch(
        `${trimTrailingSlash(this.options.config.baseUrl)}/responses`,
        {
          body: JSON.stringify(
            createRequestBody(
              text,
              context,
              this.options.config,
              this.options.capabilityCatalog ?? [],
            ),
          ),
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        },
      );

      const responseBody = await response.text();

      if (!response.ok) {
        throw new OpenAIIntentError(
          `OpenAI intent request failed with status ${response.status}.`,
          response.status,
          responseBody,
        );
      }

      try {
        return JSON.parse(responseBody) as unknown;
      } catch (error) {
        throw new OpenAIIntentError(
          "OpenAI intent response body was not valid JSON.",
          response.status,
          responseBody,
          { cause: error },
        );
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw new OpenAIIntentError(
          `OpenAI intent request timed out after ${this.options.config.timeoutMs}ms.`,
          undefined,
          undefined,
          { cause: error },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createRequestBody(
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

function parseOutputText(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new OpenAIIntentError(
      "OpenAI intent response was not valid JSON.",
      undefined,
      value,
      { cause: error },
    );
  }
}

function parseIntentInterpretation(value: unknown): IntentInterpretation {
  if (!isRecord(value)) {
    throw new OpenAIIntentError("OpenAI intent response must be an object.");
  }

  if (value.kind === "command") {
    if (value.response !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent command response must set response to null.",
      );
    }

    return {
      command: parseCommand(value.command),
    };
  }

  if (value.kind === "response") {
    if (value.command !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent fallback response must set command to null.",
      );
    }

    return {
      response: parseAssistantResponse(value.response),
    };
  }

  throw new OpenAIIntentError(
    "OpenAI intent response kind must be command or response.",
  );
}

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

function parseCommandParameters(value: unknown): AssistantCommandParameters {
  if (!Array.isArray(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response command.parameters must be an array.",
    );
  }

  const parameters: AssistantCommandParameters = {};

  for (const parameter of value) {
    const parsedParameter = parseCommandParameter(parameter);

    parameters[parsedParameter.name] = parsedParameter.value;
  }

  return parameters;
}

function parseCommand(value: unknown): AssistantCommand {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response command must be an object.",
    );
  }

  if (typeof value.capability !== "string" || value.capability.length === 0) {
    throw new OpenAIIntentError(
      "OpenAI intent response command.capability must be a non-empty string.",
    );
  }

  if (typeof value.rawText !== "string" || value.rawText.length === 0) {
    throw new OpenAIIntentError(
      "OpenAI intent response command.rawText must be a non-empty string.",
    );
  }

  return {
    capability: value.capability,
    parameters: parseCommandParameters(value.parameters),
    rawText: value.rawText,
  };
}

function parseCommandParameter(value: unknown): {
  name: string;
  value: AssistantCommandParameters[string];
} {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response command parameter must be an object.",
    );
  }

  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new OpenAIIntentError(
      "OpenAI intent response command parameter name must be a non-empty string.",
    );
  }

  if (!isScalarCommandParameter(value.value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response parameters must be scalar values.",
    );
  }

  return {
    name: value.name,
    value: value.value,
  };
}

function parseAssistantResponse(value: unknown): AssistantResponse {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response fallback response must be an object.",
    );
  }

  if (!isAssistantResponseStatus(value.status)) {
    throw new OpenAIIntentError(
      "OpenAI intent response status must be a valid assistant response status.",
    );
  }

  if (typeof value.text !== "string" || value.text.length === 0) {
    throw new OpenAIIntentError(
      "OpenAI intent response text must be a non-empty string.",
    );
  }

  return {
    status: value.status,
    text: value.text,
  };
}

function extractOutputText(value: unknown): string {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response body must be an object.",
    );
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

  throw new OpenAIIntentError(
    "OpenAI intent response did not include output text.",
  );
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

function isAssistantResponseStatus(
  value: unknown,
): value is AssistantResponseStatus {
  return (
    value === "ok" ||
    value === "unknown" ||
    value === "unsupported" ||
    value === "invalid" ||
    value === "needs_confirmation" ||
    value === "error"
  );
}

function isScalarCommandParameter(
  value: unknown,
): value is AssistantCommandParameters[string] {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}
