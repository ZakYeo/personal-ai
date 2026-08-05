import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("profile feature adapters", () => {
  it("routes deterministic profile commands through the local adapter", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        profile: { adapter: "local", enabled: true },
      }),
      now: () => now,
    });

    await expect(
      assistant.handleText("Hey Jarvis, set my name to Zak"),
    ).resolves.toMatchObject({
      status: "ok",
      text: "I’ll remember that your preferred name is Zak.",
    });
    await expect(
      assistant.handleText("Hey Jarvis, what is my name?"),
    ).resolves.toMatchObject({
      status: "ok",
      text: "Your preferred name is Zak.",
    });
  });

  it("persists a profile through a config-directory-relative file adapter", async () => {
    const configDirectory = await mkdtemp(
      join(tmpdir(), "personal-ai-profile-config-"),
    );
    const config = parseAssistantConfig(rawProfileConfig("file"), {
      featureAdapterRegistry: createDefaultFeatureAdapterRegistry({
        profile: { configDirectory },
      }),
    });
    const first = await createConfiguredTextRuntime({ config, now: () => now });
    await first.handleText("Hey Jarvis, set my name to Zak");

    const second = await createConfiguredTextRuntime({
      config,
      now: () => now,
    });
    await expect(
      second.handleText("Hey Jarvis, what is my name?"),
    ).resolves.toMatchObject({ text: "Your preferred name is Zak." });
  });

  it("shares only the stored home-location reader with weather", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        profile: { adapter: "local", enabled: true },
        weather: { adapter: "mock", enabled: true },
      }),
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });
    await assistant.handleText("Hey Jarvis, set my home location to London");

    const response = await assistant.handleText(
      "Hey Jarvis, will I need a coat at home tomorrow morning?",
    );

    expect(response.status).toBe("ok");
    expect(response.text).toContain("London's forecast");
    expect(response.text).not.toContain("Which location should I check?");
  });

  it("validates file state config only when the file adapter is selected", () => {
    expect(() =>
      parseAssistantConfig(rawProfileConfig("file", { state: {} })),
    ).toThrow(
      'Config feature "profile".state.path must be a non-empty string.',
    );
    expect(() =>
      parseAssistantConfig(rawProfileConfig("local", { state: {} })),
    ).not.toThrow();
  });
});

function rawProfileConfig(
  adapter: "file" | "local",
  overrides: Record<string, unknown> = {},
) {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      profile: {
        adapter,
        enabled: true,
        ...(adapter === "file"
          ? { state: { path: "state/profile.json" } }
          : {}),
        ...overrides,
      },
    },
    intent: { provider: "deterministic" },
    responseRewriter: { provider: "disabled" },
  };
}
