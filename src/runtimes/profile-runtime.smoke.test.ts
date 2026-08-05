import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { createMockVoiceRuntime } from "./voice/mock-voice-runtime.js";
import { writeRuntimeHarnessConfig } from "../test-support/runtime-composition.js";
import { mockVoiceConfig } from "../test-support/deterministic-runtime-fixtures.js";
import { parseProfileState } from "../adapters/local/profile-state-schema.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("personal profile runtime smoke", () => {
  it("saves every bounded field and reloads explicit facts after a text-runtime restart", async () => {
    const configPath = await writeRuntimeHarnessConfig(profileConfig());
    const first = await createConfiguredTextRuntime({
      configPath,
      now: () => now,
    });

    for (const request of [
      "set my name to Zak",
      "set my birth date to 1990-08-06",
      "set my pronouns to they/them",
      "set my home timezone to Europe/London",
      "set my home location to London",
      "I like Cycling",
      "set my response style to concise",
    ]) {
      await expect(first.handleText(request)).resolves.toMatchObject({
        status: "ok",
      });
    }

    const second = await createConfiguredTextRuntime({
      configPath,
      now: () => now,
    });
    const summary = await second.handleText("what do you know about me");
    expect(summary).toMatchObject({ status: "ok" });
    expect(summary.text).toContain("preferred name is Zak");
    expect(summary.text).toContain("birth date is 6 August 1990");
    expect(summary.text).toContain("pronouns are they/them");
    expect(summary.text).toContain("home timezone is London time");
    expect(summary.text).toContain("home location is London");
    expect(summary.text).toContain("interested in Cycling");
    expect(summary.text).toContain("prefer concise responses");
    await expect(second.handleText("how old am I")).resolves.toMatchObject({
      status: "ok",
      text: "You’re 35 years old.",
    });

    const rawPersisted: unknown = JSON.parse(
      await readFile(join(dirname(configPath), "state/profile.json"), "utf8"),
    );
    const persisted = parseProfileState(rawPersisted);
    expect(JSON.stringify(persisted)).not.toContain("set my name");
    expect(persisted.version).toBe(1);
    expect(
      persisted.facts.some(
        (fact) =>
          fact.field === "preferredName" &&
          fact.provenance === "user-authored" &&
          fact.value === "Zak",
      ),
    ).toBe(true);
  });

  it("saves and recalls the same durable profile through voice composition", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      profileConfig({ voice: mockVoiceConfig }),
    );
    const writer = await createMockVoiceRuntime({
      configPath,
      now: () => now,
      utterance: "Hey Jarvis, set my name to Zak",
    });
    await expect(writer.runOnce()).resolves.toMatchObject({
      response: {
        status: "ok",
        text: "I’ll remember that your preferred name is Zak.",
      },
      status: "spoken",
    });

    const reader = await createMockVoiceRuntime({
      configPath,
      now: () => now,
      utterance: "Hey Jarvis, what is my name?",
    });
    await expect(reader.runOnce()).resolves.toMatchObject({
      response: { status: "ok", text: "Your preferred name is Zak." },
      spokenText: "Your preferred name is Zak.",
      status: "spoken",
    });
  });
});

function profileConfig(overrides: Record<string, unknown> = {}) {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      profile: {
        adapter: "file",
        enabled: true,
        state: { path: "state/profile.json" },
      },
    },
    intent: { provider: "deterministic" },
    responseRewriter: { provider: "disabled" },
    ...overrides,
  };
}
