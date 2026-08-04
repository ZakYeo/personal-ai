import type { AssistantCommand } from "../../ports/assistant.js";
import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentInterpreterSession,
} from "../../ports/intent.js";

interface SemanticValidationOptions {
  capabilityCatalog: CapabilityCatalog;
  originalText: string;
  session: IntentInterpreterSession;
}

export function createSemanticallyValidatedIntentSession(
  options: SemanticValidationOptions,
): IntentInterpreterSession {
  let activeUserText = options.originalText;

  return {
    next: async (input) => {
      if (input?.kind === "user_reply") {
        activeUserText = input.text.trim();
      }
      const interpretation = await options.session.next(input);
      return validateIntentSemantics(
        interpretation,
        { activeUserText, originalText: options.originalText },
        options.capabilityCatalog,
      );
    },
  };
}

function validateIntentSemantics(
  interpretation: IntentInterpretation,
  text: { activeUserText: string; originalText: string },
  capabilityCatalog: CapabilityCatalog,
): IntentInterpretation {
  if (
    interpretation.kind === "clarification" ||
    interpretation.kind === "rephrase"
  ) {
    return {
      ...interpretation,
      response: { ...interpretation.response, status: "ok" },
    };
  }

  const unsafeCommand = commandsFromInterpretation(interpretation).find(
    (command) =>
      isNarrowCapabilityListRequest(command, text.activeUserText) ||
      echoesRequestInRequiredParameter(
        command,
        text.originalText,
        capabilityCatalog,
      ),
  );
  return unsafeCommand
    ? createCanonicalClarification(
        unsafeCommand.capability,
        interpretation.kind === "tool_call" ? "restart" : "resume",
      )
    : interpretation;
}

function createCanonicalClarification(
  capability: string,
  session: "restart" | "resume",
): IntentInterpretation {
  return {
    clarification: {
      capability,
      origin: "semantic_validation",
      session,
    },
    kind: "clarification",
    response: {
      status: "ok",
      text: "What details should I use for this request?",
    },
  };
}

function commandsFromInterpretation(
  interpretation: IntentInterpretation,
): readonly AssistantCommand[] {
  switch (interpretation.kind) {
    case "command":
      return [interpretation.command];
    case "plan":
      return interpretation.plan.commands;
    case "tool_call":
      return [interpretation.call.command];
    case "clarification":
    case "rephrase":
    case "replacement":
    case "conversation":
    case "unknown":
    case "unsupported":
      return [];
  }
}

function echoesRequestInRequiredParameter(
  command: AssistantCommand,
  originalText: string,
  capabilityCatalog: CapabilityCatalog,
): boolean {
  const declaration = capabilityCatalog.find(
    ({ capability }) => capability.name === command.capability,
  )?.capability;
  if (!declaration?.parameters) return false;

  const normalizedRequest = normalizeText(originalText);
  return Object.entries(declaration.parameters).some(
    ([name, parameter]) =>
      parameter.required &&
      typeof command.parameters[name] === "string" &&
      normalizeText(command.parameters[name]) === normalizedRequest,
  );
}

function isNarrowCapabilityListRequest(
  command: AssistantCommand,
  originalText: string,
): boolean {
  return (
    command.capability === "assistant.capabilities.list" &&
    !isBroadCapabilityQuestion(originalText)
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
