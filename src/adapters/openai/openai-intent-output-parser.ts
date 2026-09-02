import { modelOutputLimits } from "../../application/model-output-policy.js";
import type {
  AssistantCommand,
  AssistantCommandParameters,
  AssistantResponse,
  AssistantResponseStatus,
} from "../../ports/assistant.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { OpenAIIntentError } from "./openai-intent-error.js";
import { isRecord } from "../parsing.js";
import {
  getOpenAIIntentOutputContract,
  isOpenAIIntentOutputKind,
} from "./openai-intent-output-contract.js";
import { parseValidatedOpenAIStructuredOutput } from "./openai-structured-output-parser.js";
import { isOpenAISpokenTextSafe } from "./openai-spoken-style.js";

export function parseOpenAIIntentOutput(value: string): IntentInterpretation {
  return parseValidatedOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIIntentError(message, undefined, responseBody, { cause }),
    invalidJsonMessage: "OpenAI intent response was not valid JSON.",
    invalidOutputMessage: "OpenAI intent response was invalid.",
    validate: (parsed) => {
      if (!isRecord(parsed) || !isRecord(parsed.interpretation)) {
        throw new OpenAIIntentError(
          "OpenAI intent response must contain an interpretation object.",
        );
      }
      return parseIntentInterpretation(parsed.interpretation);
    },
  });
}

function parseIntentInterpretation(value: unknown): IntentInterpretation {
  if (!isRecord(value)) {
    throw new OpenAIIntentError("OpenAI intent response must be an object.");
  }

  if (!isOpenAIIntentOutputKind(value.kind)) {
    throw new OpenAIIntentError(
      "OpenAI intent response kind is not a supported terminal variant.",
    );
  }
  const kind = value.kind;
  const variant = getOpenAIIntentOutputContract(kind);
  assertVariantFields(value, variant.fields);

  if (kind === "command") {
    return {
      command: parseCommand(value.command),
      kind: "command",
    };
  }

  if (kind === "plan") {
    return {
      kind: "plan",
      plan: parsePlan(value.plan),
    };
  }

  if (kind === "conversation") {
    return {
      kind: "conversation",
    };
  }

  if (kind === "clarification") {
    if (
      typeof value.clarificationCapability !== "string" ||
      value.clarificationCapability.length === 0
    ) {
      throw new OpenAIIntentError(
        "OpenAI intent clarification must identify a non-empty capability.",
      );
    }
    const partialCommand = parseCommand(value.clarificationCommand);
    if (partialCommand.capability !== value.clarificationCapability) {
      throw new OpenAIIntentError(
        "OpenAI intent clarification command must match its selected capability.",
      );
    }
    if (
      typeof value.clarificationParameter !== "string" ||
      value.clarificationParameter.length === 0
    ) {
      throw new OpenAIIntentError(
        "OpenAI intent clarification must identify a non-empty parameter.",
      );
    }
    return {
      clarification: {
        capability: value.clarificationCapability,
        origin: "intent_interpreter",
        parameter: value.clarificationParameter,
        partialCommand,
        session: "resume",
      },
      kind: "clarification",
      response: parseAssistantResponse(value.response),
    };
  }

  if (kind === "rephrase") {
    return {
      kind: "rephrase",
      response: parseAssistantResponse(value.response),
    };
  }

  if (kind === "replacement") {
    return { kind: "replacement" };
  }

  if (kind === "unknown" || kind === "unsupported") {
    return {
      kind,
      response: parseAssistantResponse(value.response),
    };
  }

  return assertUnreachable(kind);
}

function assertUnreachable(value: never): never {
  throw new OpenAIIntentError(
    `OpenAI intent response kind ${String(value)} was not handled.`,
  );
}

function assertVariantFields(
  value: Record<string, unknown>,
  expectedFields: readonly string[],
): void {
  const actualFields = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  if (
    actualFields.length !== expected.length ||
    actualFields.some((field, index) => field !== expected[index])
  ) {
    throw new OpenAIIntentError(
      `OpenAI intent ${String(value.kind)} response fields must be ${expected.join(", ")}.`,
    );
  }
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
  if (value.text.length > modelOutputLimits.responseCharacters) {
    throw new OpenAIIntentError(
      "OpenAI intent response text exceeded the application limit.",
    );
  }
  if (!isOpenAISpokenTextSafe(value.text)) {
    throw new OpenAIIntentError(
      "OpenAI intent response text must be suitable for spoken delivery.",
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
