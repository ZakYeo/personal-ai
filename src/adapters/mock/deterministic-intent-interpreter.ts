import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../../ports/intent.js";
import type { DeterministicCapabilityRule } from "../../ports/deterministic-feature-rules.js";
import { stripWakePhrase } from "../spoken-text.js";

export interface DeterministicIntentRule {
  capability: string;
  match: DeterministicCapabilityRule;
}

export class DeterministicIntentInterpreter implements IntentInterpreterPort {
  constructor(private readonly rules: DeterministicIntentRule[] = []) {}

  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation> {
    const normalizedText = normalizeCommandText(
      text,
      context.config.assistant.wakePhrases,
    );

    for (const rule of this.rules) {
      const parameters = rule.match(normalizedText);

      if (parameters) {
        return Promise.resolve({
          kind: "command",
          command: createCommand(rule.capability, text, parameters),
        });
      }
    }

    return Promise.resolve({
      kind: "unknown",
      response: {
        status: "unknown",
        text: "I could not map that to a deterministic command.",
      },
    });
  }
}

export function normalizeCommandText(
  text: string,
  wakePhrases: string[] = ["hey jarvis"],
): string {
  return stripWakePhrase(text, wakePhrases);
}

function createCommand(
  capability: string,
  rawText: string,
  parameters: AssistantCommand["parameters"],
): AssistantCommand {
  return {
    capability,
    parameters,
    rawText,
  };
}
