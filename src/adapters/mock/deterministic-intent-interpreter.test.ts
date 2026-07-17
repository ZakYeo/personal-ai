import {
  DeterministicIntentInterpreter,
  normalizeCommandText,
} from "./deterministic-intent-interpreter.js";
import type { AssistantContext } from "../../ports/assistant.js";
import { interpretOnce } from "../../ports/intent.js";

const context: AssistantContext = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
};

describe("DeterministicIntentInterpreter", () => {
  it("starts an interpretation session whose first step preserves one-shot behavior", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "test.echo",
        match: () => ({ text: "hello" }),
      },
    ]);

    await expect(
      interpreter.start("echo this", context).next(),
    ).resolves.toEqual({
      command: {
        capability: "test.echo",
        parameters: { text: "hello" },
        rawText: "echo this",
      },
      kind: "command",
    });
  });
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
      interpretOnce(ruleBackedInterpreter, "Hey Jarvis, echo this", context),
    ).resolves.toEqual({
      command: {
        capability: "test.echo",
        parameters: { value: "echo this" },
        rawText: "Hey Jarvis, echo this",
      },
      kind: "command",
    });
  });

  it("interprets every distinct matching capability as one ordered plan", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "calendar.search_events",
        match: (text) => (text.includes("calendar") ? {} : undefined),
      },
      {
        capability: "alarm.create",
        match: (text) =>
          text.includes("alarm") ? { minutesFromNow: 10 } : undefined,
      },
    ]);

    await expect(
      interpretOnce(
        interpreter,
        "Hey Jarvis, check my calendar and set an alarm in 10 minutes",
        context,
      ),
    ).resolves.toEqual({
      kind: "plan",
      plan: {
        commands: [
          {
            capability: "calendar.search_events",
            parameters: {},
            rawText:
              "Hey Jarvis, check my calendar and set an alarm in 10 minutes",
          },
          {
            capability: "alarm.create",
            parameters: { minutesFromNow: 10 },
            rawText:
              "Hey Jarvis, check my calendar and set an alarm in 10 minutes",
          },
        ],
      },
    });
  });

  it("orders compound commands by their clauses rather than rule registration", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "calendar.search_events",
        match: (text) => (text.includes("calendar") ? {} : undefined),
      },
      {
        capability: "alarm.create",
        match: (text) => (text.includes("alarm") ? {} : undefined),
      },
    ]);

    const result = await interpretOnce(
      interpreter,
      "Set an alarm and then check my calendar",
      context,
    );

    expect(result).toMatchObject({
      kind: "plan",
      plan: {
        commands: [
          { capability: "alarm.create" },
          { capability: "calendar.search_events" },
        ],
      },
    });
  });

  it("retains utterance order for three independently matched clauses", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "calendar.search_events",
        match: (text) => (text.includes("calendar") ? {} : undefined),
      },
      {
        capability: "messaging.draft_reply",
        match: (text) => (text.includes("message") ? {} : undefined),
      },
      {
        capability: "alarm.create",
        match: (text) => (text.includes("alarm") ? {} : undefined),
      },
    ]);

    const result = await interpretOnce(
      interpreter,
      "Draft a message, then set an alarm, then check my calendar",
      context,
    );

    expect(result).toMatchObject({
      kind: "plan",
      plan: {
        commands: [
          { capability: "messaging.draft_reply" },
          { capability: "alarm.create" },
          { capability: "calendar.search_events" },
        ],
      },
    });
  });

  it("rejects a compound request when any requested clause is unresolved", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "calendar.search_events",
        match: (text) => (text.includes("calendar") ? {} : undefined),
      },
      {
        capability: "alarm.create",
        match: (text) => (text.includes("alarm") ? {} : undefined),
      },
    ]);

    await expect(
      interpretOnce(
        interpreter,
        "Check my calendar, then turn on the lights, then set an alarm",
        context,
      ),
    ).resolves.toEqual({
      kind: "unsupported",
      response: {
        status: "unsupported",
        text: "I could not resolve every command in that request.",
      },
    });
  });

  it("counts every requested clause when enforcing the plan bound", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "calendar.search_events",
        match: (text) => (text.includes("calendar") ? {} : undefined),
      },
      {
        capability: "alarm.create",
        match: (text) => (text.includes("alarm") ? {} : undefined),
      },
    ]);

    await expect(
      interpretOnce(
        interpreter,
        "Check my calendar, then turn on the lights, then set an alarm, then check my calendar",
        context,
      ),
    ).resolves.toEqual({
      kind: "unsupported",
      response: {
        status: "unsupported",
        text: "I can handle at most three commands in one request.",
      },
    });
  });

  it("preserves conjunctions inside a single command argument", async () => {
    const interpreter = new DeterministicIntentInterpreter([
      {
        capability: "alarm.create",
        match: (text) =>
          text === "set an alarm to fish and chips in 10 minutes"
            ? { label: "fish and chips", minutesFromNow: 10 }
            : undefined,
      },
    ]);

    await expect(
      interpretOnce(
        interpreter,
        "Set an alarm to fish and chips in 10 minutes",
        context,
      ),
    ).resolves.toMatchObject({
      command: {
        capability: "alarm.create",
        parameters: { label: "fish and chips", minutesFromNow: 10 },
      },
      kind: "command",
    });
  });

  it("does not own feature-specific default routing rules", async () => {
    const interpreter = new DeterministicIntentInterpreter();

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      kind: "unknown",
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
      interpretOnce(interpreter, "Hey Jarvis, order lunch", context),
    ).resolves.toEqual({
      kind: "unknown",
      response: {
        status: "unknown",
        text: "I could not map that to a deterministic command.",
      },
    });
  });
});
