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

    const clauseCommands = interpretClauses(normalizedText, text, this.rules);
    if (clauseCommands.length > 1) {
      if (clauseCommands.length > 3) {
        return Promise.resolve({
          kind: "unsupported",
          response: {
            status: "unsupported",
            text: "I can handle at most three commands in one request.",
          },
        });
      }

      return Promise.resolve({
        kind: "plan",
        plan: { commands: clauseCommands },
      });
    }

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

function interpretClauses(
  normalizedText: string,
  rawText: string,
  rules: readonly DeterministicIntentRule[],
): AssistantCommand[] {
  const clauses = normalizedText
    .split(/\s*(?:,\s*)?\b(?:and then|then|and)\b\s*/u)
    .map((clause) => clause.trim())
    .filter(Boolean);

  if (clauses.length < 2) {
    return [];
  }

  return clauses.flatMap((clause) => {
    for (const rule of rules) {
      const parameters = rule.match(clause);
      if (parameters) {
        return [createCommand(rule.capability, rawText, parameters)];
      }
    }

    return [];
  });
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
