import type {
  AssistantCommand,
  AssistantCommandParameters,
  AssistantResponse,
  AssistantResponseStatus,
} from "../../ports/assistant.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { OpenAIIntentError } from "./openai-intent-error.js";

export function parseOpenAIIntentOutput(value: string): IntentInterpretation {
  return parseIntentInterpretation(parseOutputText(value));
}

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
      kind: "command",
    };
  }

  if (value.kind === "response") {
    if (value.command !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent fallback response must set command to null.",
      );
    }

    return {
      kind: "unknown",
      response: parseAssistantResponse(value.response),
    };
  }

  throw new OpenAIIntentError(
    "OpenAI intent response kind must be command or response.",
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
