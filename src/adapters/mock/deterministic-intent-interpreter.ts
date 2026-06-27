import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../../ports/intent.js";
import { stripWakePhrase } from "../spoken-text.js";

export class DeterministicIntentInterpreter implements IntentInterpreterPort {
  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation> {
    const normalizedText = normalizeCommandText(
      text,
      context.config.assistant.wakePhrases,
    );

    if (
      normalizedText.includes("calendar") &&
      normalizedText.includes("upcoming wedding")
    ) {
      return Promise.resolve({
        command: createCommand("calendar.search_events", text, {
          query: "upcoming wedding",
        }),
      });
    }

    if (
      normalizedText.includes("whatsapp") &&
      (normalizedText.includes("respond") ||
        normalizedText.includes("reply") ||
        normalizedText.includes("draft"))
    ) {
      return Promise.resolve({
        command: createCommand("messaging.draft_reply", text, {
          channel: "whatsapp",
        }),
      });
    }

    const alarmCreateMatch = normalizedText.match(
      /\bset (?:an? )?alarm(?: to (?<label>.+?))? in (?<minutes>\d+) minutes?\b/u,
    );

    if (alarmCreateMatch?.groups?.minutes) {
      return Promise.resolve({
        command: createCommand("alarm.create", text, {
          label: alarmCreateMatch.groups.label ?? "alarm",
          minutesFromNow: Number(alarmCreateMatch.groups.minutes),
        }),
      });
    }

    if (
      normalizedText.includes("alarm") &&
      (normalizedText.includes("list") ||
        normalizedText.includes("show") ||
        normalizedText.includes("what alarms"))
    ) {
      return Promise.resolve({
        command: createCommand("alarm.list", text, {}),
      });
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
