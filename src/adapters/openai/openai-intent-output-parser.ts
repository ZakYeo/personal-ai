import type {
  AssistantCommand,
  AssistantCommandParameters,
  AssistantResponse,
  AssistantResponseStatus,
} from "../../ports/assistant.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { OpenAIIntentError } from "./openai-intent-error.js";
import { isRecord } from "../parsing.js";
import { parseOpenAIStructuredOutput } from "./openai-structured-output-parser.js";

export function parseOpenAIIntentOutput(value: string): IntentInterpretation {
  return parseIntentInterpretation(
    parseOpenAIStructuredOutput(value, {
      createError: ({ cause, message, responseBody }) =>
        new OpenAIIntentError(message, undefined, responseBody, { cause }),
      invalidJsonMessage: "OpenAI intent response was not valid JSON.",
    }),
  );
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

  if (value.kind === "plan") {
    if (value.command !== null || value.response !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent plan response must set command and response to null.",
      );
    }

    return {
      kind: "plan",
      plan: parsePlan(value.plan),
    };
  }

  if (value.kind === "conversation") {
    if (value.command !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent conversation response must set command to null.",
      );
    }

    return {
      kind: "conversation",
    };
  }

  if (value.kind === "unknown" || value.kind === "unsupported") {
    if (value.command !== null) {
      throw new OpenAIIntentError(
        "OpenAI intent fallback response must set command to null.",
      );
    }

    return {
      kind: value.kind,
      response: parseAssistantResponse(value.response),
    };
  }

  throw new OpenAIIntentError(
    "OpenAI intent response kind must be command, plan, conversation, unknown, or unsupported.",
  );
}

function parsePlan(value: unknown): { commands: AssistantCommand[] } {
  if (!isRecord(value) || !Array.isArray(value.commands)) {
    throw new OpenAIIntentError(
      "OpenAI intent response plan must contain a commands array.",
    );
  }

  if (value.commands.length < 1 || value.commands.length > 3) {
    throw new OpenAIIntentError(
      "OpenAI intent response plan.commands must contain one to three commands.",
    );
  }

  return { commands: value.commands.map(parseCommand) };
}

function parseCommandParameters(value: unknown): AssistantCommandParameters {
  if (!Array.isArray(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response command.parameters must be an array.",
    );
  }

  const parameters: AssistantCommandParameters = {};
  const parameterNames = new Set<string>();

  for (const parameter of value) {
    const parsedParameter = parseCommandParameter(parameter);

    if (parameterNames.has(parsedParameter.name)) {
      throw new OpenAIIntentError(
        `OpenAI intent response command.parameters contains duplicate name "${parsedParameter.name}".`,
      );
    }

    parameterNames.add(parsedParameter.name);
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
