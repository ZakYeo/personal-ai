import {
  DeterministicIntentInterpreter,
  normalizeCommandText,
} from "./deterministic-intent-interpreter.js";
import type { AssistantContext } from "../../ports/assistant.js";

const context: AssistantContext = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
};

describe("DeterministicIntentInterpreter", () => {
  const interpreter = new DeterministicIntentInterpreter();

  it("normalizes case, spacing, punctuation, and the default wake phrase", () => {
    expect(normalizeCommandText("  Hey Jarvis,   LIST my alarms! ")).toBe(
      "list my alarms",
    );
  });

  it("interprets the documented calendar command", async () => {
    await expect(
      interpreter.interpret(
        "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
        context,
      ),
    ).resolves.toEqual({
      command: {
        capability: "calendar.search_events",
        parameters: { query: "upcoming wedding" },
        rawText:
          "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
      },
    });
  });

  it("interprets the documented WhatsApp draft command", async () => {
    await expect(
      interpreter.interpret(
        "Hey Jarvis, can you respond to that WhatsApp message for me?",
        context,
      ),
    ).resolves.toEqual({
      command: {
        capability: "messaging.draft_reply",
        parameters: { channel: "whatsapp" },
        rawText: "Hey Jarvis, can you respond to that WhatsApp message for me?",
      },
    });
  });

  it("interprets the documented alarm creation command", async () => {
    await expect(
      interpreter.interpret(
        "Hey Jarvis, set an alarm to ping me in 10 minutes.",
        context,
      ),
    ).resolves.toEqual({
      command: {
        capability: "alarm.create",
        parameters: { label: "ping me", minutesFromNow: 10 },
        rawText: "Hey Jarvis, set an alarm to ping me in 10 minutes.",
      },
    });
  });

  it("interprets alarm list commands", async () => {
    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      command: {
        capability: "alarm.list",
        parameters: {},
        rawText: "Hey Jarvis, list my alarms",
      },
    });
  });

  it("interprets commands through configured deterministic rule data", async () => {
    const ruleBackedInterpreter = new DeterministicIntentInterpreter([
      {
        capability: "test.echo",
        match: (text) => (text.includes("echo") ? { value: text } : undefined),
      },
    ]);

    await expect(
      ruleBackedInterpreter.interpret("Hey Jarvis, echo this", context),
    ).resolves.toEqual({
      command: {
        capability: "test.echo",
        parameters: { value: "echo this" },
        rawText: "Hey Jarvis, echo this",
      },
    });
  });

  it("returns an unknown response when no deterministic command matches", async () => {
    await expect(
      interpreter.interpret("Hey Jarvis, order lunch", context),
    ).resolves.toEqual({
      response: {
        status: "unknown",
        text: "I could not map that to a deterministic command.",
      },
    });
  });
});
