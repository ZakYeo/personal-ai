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
  it("normalizes case, spacing, punctuation, and the default wake phrase", () => {
    expect(normalizeCommandText("  Hey Jarvis,   LIST my alarms! ")).toBe(
      "list my alarms",
    );
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

  it("does not own feature-specific default routing rules", async () => {
    const interpreter = new DeterministicIntentInterpreter();

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      response: {
        status: "unknown",
        text: "I could not map that to a deterministic command.",
      },
    });
  });

  it("returns an unknown response when no deterministic command matches", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "test.echo",
        match: (text) => (text.includes("echo") ? { value: text } : undefined),
      },
    ]);

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
