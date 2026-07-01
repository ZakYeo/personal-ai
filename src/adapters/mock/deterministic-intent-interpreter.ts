import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../../ports/intent.js";
import { stripWakePhrase } from "../spoken-text.js";

interface DeterministicIntentRule {
  capability: string;
  match(normalizedText: string): AssistantCommand["parameters"] | undefined;
}

export class DeterministicIntentInterpreter implements IntentInterpreterPort {
  constructor(
    private readonly rules: DeterministicIntentRule[] = defaultDeterministicIntentRules,
  ) {}

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
          command: createCommand(rule.capability, text, parameters),
        });
      }
    }

    return Promise.resolve({
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

const defaultDeterministicIntentRules: DeterministicIntentRule[] = [
  {
    capability: "calendar.search_events",
    match: (text) =>
      text.includes("calendar") && text.includes("upcoming wedding")
        ? { query: "upcoming wedding" }
        : undefined,
  },
  {
    capability: "messaging.draft_reply",
    match: (text) =>
      text.includes("whatsapp") &&
      (text.includes("respond") ||
        text.includes("reply") ||
        text.includes("draft"))
        ? { channel: "whatsapp" }
        : undefined,
  },
  {
    capability: "alarm.create",
    match: (text) => {
      const alarmCreateMatch = text.match(
        /\bset (?:an? )?alarm(?: to (?<label>.+?))? in (?<minutes>\d+) minutes?\b/u,
      );

      if (!alarmCreateMatch?.groups?.minutes) {
        return;
      }

      return {
        label: alarmCreateMatch.groups.label ?? "alarm",
        minutesFromNow: Number(alarmCreateMatch.groups.minutes),
      };
    },
  },
  {
    capability: "alarm.list",
    match: (text) =>
      text.includes("alarm") &&
      (text.includes("list") ||
        text.includes("show") ||
        text.includes("what alarms"))
        ? {}
        : undefined,
  },
];
