import { access } from "node:fs/promises";
import { env } from "node:process";

import { createFileAlarmStore } from "../adapters/local/file-alarm-store.js";
import { writePersistentAlarmRuntimeConfig } from "../test-support/runtime-composition.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI compound plans live E2E", () => {
  it("validates and confirms a calendar and durable-alarm plan", async () => {
    const { configPath, statePath } = await writePersistentAlarmRuntimeConfig(
      createLivePlanConfig(),
    );
    const assistant = await createConfiguredTextRuntime({
      configPath,
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => new Date("2026-07-14T09:00:00.000Z"),
    });

    const prompt = await assistant.handleText(
      "Hey Jarvis, check my upcoming calendar events and set an alarm called tea for ten minutes from now.",
    );

    expect(prompt).toMatchObject({
      expectsFollowUp: true,
      status: "needs_confirmation",
    });
    expect(prompt.text).toContain("tea");
    expect(prompt.text).toContain("2026-07-14T09:10:00.000Z");
    await expect(access(statePath)).rejects.toMatchObject({ code: "ENOENT" });

    const response = await assistant.handleText("yes");
    expect(response).toMatchObject({ status: "ok" });
    expect(response.text).toContain("Upcoming wedding");
    expect(response.text).toContain("Alarm set");
    await expect(
      createFileAlarmStore({ filePath: statePath }).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        label: "tea",
        scheduledFor: "2026-07-14T09:10:00.000Z",
      }),
    ]);
  }, 30_000);
});

function createLivePlanConfig() {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: {
      history: { maxTurnsBeforeCompaction: 5 },
      provider: "disabled",
    },
    features: {
      alarms: {
        adapter: "file",
        enabled: true,
        state: { path: "state/alarms.json" },
      },
      calendar: {
        adapter: "mock",
        enabled: true,
        upcomingWindowDays: 92,
      },
    },
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  };
}
