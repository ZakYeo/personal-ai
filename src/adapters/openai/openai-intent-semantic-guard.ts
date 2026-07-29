import type { AssistantCommand } from "../../ports/assistant.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";

const clarification: IntentInterpretation = {
  kind: "clarification",
  response: {
    status: "ok",
    text: "What details should I use for this request?",
  },
};

export function guardOpenAIIntentSemantics(
  interpretation: IntentInterpretation,
  rawText: string,
  capabilityCatalog: readonly OpenAIIntentCapability[],
): IntentInterpretation {
  if (interpretation.kind === "clarification") {
    return {
      ...interpretation,
      response: { ...interpretation.response, status: "ok" },
    };
  }

  const command =
    interpretation.kind === "command"
      ? interpretation.command
      : interpretation.kind === "tool_call"
        ? interpretation.call.command
        : undefined;
  if (!command) return interpretation;

  if (
    command.capability === "assistant.capabilities.list" &&
    !isBroadCapabilityQuestion(rawText)
  ) {
    return clarification;
  }

  return echoesRequestInRequiredParameter(command, rawText, capabilityCatalog)
    ? clarification
    : interpretation;
}

function echoesRequestInRequiredParameter(
  command: AssistantCommand,
  rawText: string,
  capabilityCatalog: readonly OpenAIIntentCapability[],
): boolean {
  const declaration = capabilityCatalog.find(
    ({ capability }) => capability.name === command.capability,
  )?.capability;
  if (!declaration?.parameters) return false;

  const normalizedRequest = normalizeText(rawText);
  return Object.entries(declaration.parameters).some(
    ([name, parameter]) =>
      parameter.required &&
      typeof command.parameters[name] === "string" &&
      normalizeText(command.parameters[name]) === normalizedRequest,
  );
}

function isBroadCapabilityQuestion(text: string): boolean {
  return (
    /\b(?:capability|capabilities|capable|features?|functionality|functionalities)\b/iu.test(
      text,
    ) || /\b(?:what (?:else )?can you do|help (?:me )?with)\b/iu.test(text)
  );
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
