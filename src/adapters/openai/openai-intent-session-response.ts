import type { AssistantCommandParameters } from "../../ports/assistant.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { isRecord } from "../parsing.js";
import { OpenAIIntentError } from "./openai-intent-error.js";
import { parseOpenAIIntentOutput } from "./openai-intent-output-parser.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";

interface ParsedOpenAIIntentSessionResponse {
  interpretation: IntentInterpretation;
  responseId: string;
}

export function parseOpenAIIntentSessionResponse(
  value: unknown,
  toolNames: ReadonlyMap<string, OpenAIIntentCapability>,
  rawText: string,
): ParsedOpenAIIntentSessionResponse {
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent response body must be an object.",
    );
  }

  const functionCalls = Array.isArray(value.output)
    ? value.output.filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) && item.type === "function_call",
      )
    : [];
  const outputText = findOutputText(value);

  if (functionCalls.length > 0 && outputText !== undefined) {
    throw new OpenAIIntentError(
      "OpenAI intent response must not mix function calls with terminal output.",
    );
  }
  if (functionCalls.length > 1) {
    throw new OpenAIIntentError(
      "OpenAI intent response must contain at most one function call.",
    );
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new OpenAIIntentError(
      "OpenAI intent response must include a nonempty id.",
    );
  }
  const responseId = value.id;
  const functionCall = functionCalls[0];
  if (!functionCall) {
    return {
      interpretation: parseOpenAIIntentOutput(extractOpenAIOutputText(value)),
      responseId,
    };
  }
  if (
    typeof functionCall.call_id !== "string" ||
    functionCall.call_id.length === 0 ||
    typeof functionCall.name !== "string" ||
    typeof functionCall.arguments !== "string"
  ) {
    throw new OpenAIIntentError(
      "OpenAI intent function call must include call_id, name, and arguments.",
    );
  }

  const capability = toolNames.get(functionCall.name);
  if (!capability) {
    throw new OpenAIIntentError(
      `OpenAI intent response called unknown tool "${functionCall.name}".`,
    );
  }

  return {
    interpretation: {
      call: {
        command: {
          capability: capability.capability.name,
          parameters: parseToolArguments(
            functionCall.arguments,
            capability.capability.parameters ?? {},
          ),
          rawText,
        },
        id: functionCall.call_id,
      },
      kind: "tool_call",
    },
    responseId,
  };
}

function parseToolArguments(
  rawArguments: string,
  declarations: NonNullable<OpenAIIntentCapability["capability"]["parameters"]>,
): AssistantCommandParameters {
  let value: unknown;
  try {
    value = JSON.parse(rawArguments) as unknown;
  } catch (cause) {
    throw new OpenAIIntentError(
      "OpenAI intent function arguments were not valid JSON.",
      undefined,
      rawArguments,
      { cause },
    );
  }
  if (!isRecord(value)) {
    throw new OpenAIIntentError(
      "OpenAI intent function arguments must be an object.",
    );
  }

  const parameters: AssistantCommandParameters = {};
  for (const [name, argument] of Object.entries(value)) {
    const declaration = declarations[name];
    if (!declaration) {
      throw new OpenAIIntentError(
        `OpenAI intent function arguments contain unknown parameter "${name}".`,
      );
    }
    if (argument === null && !declaration.required) continue;
    if (
      (declaration.type === "string" && typeof argument !== "string") ||
      (declaration.type === "number" && typeof argument !== "number") ||
      (declaration.type === "boolean" && typeof argument !== "boolean")
    ) {
      throw new OpenAIIntentError(
        `OpenAI intent function argument "${name}" must be ${declaration.type}.`,
      );
    }
    parameters[name] = argument as string | number | boolean;
  }
  return parameters;
}

function findOutputText(value: Record<string, unknown>): string | undefined {
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return;
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }
}
