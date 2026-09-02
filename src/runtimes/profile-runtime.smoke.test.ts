import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { createMockVoiceRuntime } from "./voice/mock-voice-runtime.js";
import { writeRuntimeHarnessConfig } from "../test-support/runtime-composition.js";
import { mockVoiceConfig } from "../test-support/deterministic-runtime-fixtures.js";
import { parseProfileState } from "../adapters/local/profile-state-schema.js";
import { jsonResponse } from "../test-support/adapter-contract.js";

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

  it("asks for a missing home location, saves the reply, and completes the original weather request", async () => {
    let requestNumber = 0;
    const fetchStub = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        requestNumber++;
        if (typeof init?.body !== "string") {
          throw new Error("OpenAI smoke request body was not JSON text.");
        }
        const body = JSON.parse(init.body) as {
          tools?: Array<{ description: string; name: string }>;
        };
        if (requestNumber === 1) {
          const profileLookup = body.tools?.find(({ description }) =>
            description.startsWith("Read exactly one explicitly stored"),
          );
          if (!profileLookup)
            throw new Error("Profile lookup tool was absent.");
          return Promise.resolve(
            jsonResponse({
              id: "profile-lookup-response",
              output: [
                {
                  arguments: JSON.stringify({ field: "homeLocation" }),
                  call_id: "profile-lookup-call",
                  name: profileLookup.name,
                  type: "function_call",
                },
              ],
            }),
          );
        }
        if (requestNumber === 2) {
          return Promise.resolve(
            jsonResponse({
              id: "profile-clarification-response",
              output_text: JSON.stringify({
                interpretation: {
                  clarificationCapability: "weather.current",
                  clarificationCommand: {
                    capability: "weather.current",
                    parameters: [],
                    rawText:
                      "Can you check what the weather's like at home please?",
                  },
                  clarificationParameter: "location",
                  kind: "clarification",
                  response: {
                    status: "ok",
                    text: "Which place should I check?",
                  },
                },
              }),
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            id: "profile-resumed-response",
            output_text: JSON.stringify({
              interpretation: {
                command: {
                  capability: "weather.current",
                  parameters: [{ name: "location", value: "London" }],
                  rawText: "London",
                },
                kind: "command",
              },
            }),
          }),
        );
      },
    ) as typeof globalThis.fetch;
    const configPath = await writeRuntimeHarnessConfig(
      profileConfig({
        features: {
          profile: {
            adapter: "file",
            enabled: true,
            state: { path: "state/profile.json" },
          },
          weather: {
            adapter: "mock",
            enabled: true,
            watches: { adapter: "local" },
          },
        },
        intent: {
          openai: { model: "profile-smoke-model", reasoningEffort: "none" },
          provider: "openai",
        },
      }),
    );
    const assistant = await createConfiguredTextRuntime({
      configPath,
      env: { OPENAI_API_KEY: "profile-smoke-key" },
      fetch: fetchStub,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });

    await expect(
      assistant.handleText("Can you check what the weather's like at home?"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What is your home location? I’ll save it to your profile and then continue.",
    });
    await expect(assistant.handleText("London")).resolves.toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "I’ll remember London as your home location. In London, it is",
      ) as string,
    });
    const rawPersisted: unknown = JSON.parse(
      await readFile(join(dirname(configPath), "state/profile.json"), "utf8"),
    );
    expect(parseProfileState(rawPersisted).facts).toContainEqual(
      expect.objectContaining({
        field: "homeLocation",
        provenance: "user-authored",
        value: "London",
      }),
    );
    expect(fetchStub).toHaveBeenCalledTimes(3);
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
