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

    const commands: AssistantCommand[] = [];
    const matchedCapabilities = new Set<string>();

    for (const rule of this.rules) {
      if (matchedCapabilities.has(rule.capability)) {
        continue;
      }

      const parameters = rule.match(normalizedText);

      if (parameters) {
        matchedCapabilities.add(rule.capability);
        commands.push(createCommand(rule.capability, text, parameters));
      }
    }

    if (commands.length === 1) {
      return Promise.resolve({ kind: "command", command: commands[0]! });
    }

    if (commands.length > 1) {
      return Promise.resolve({ kind: "plan", plan: { commands } });
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
