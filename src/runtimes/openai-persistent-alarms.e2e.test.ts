import { access } from "node:fs/promises";
import { env } from "node:process";
import { createFileAlarmStore } from "../adapters/local/file-alarm-store.js";
import { writePersistentAlarmRuntimeConfig } from "../test-support/runtime-composition.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI persistent alarms live E2E", () => {
  it("confirms creation and lists the durable alarm after restart", async () => {
    const { configPath, statePath } = await writePersistentAlarmRuntimeConfig(
      createLiveAlarmConfig(),
    );
    const createRuntime = () =>
      createConfiguredTextRuntime({
        configPath,
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => new Date("2026-07-13T16:00:00.000Z"),
      });
    const firstRuntime = await createRuntime();

    await expect(
      firstRuntime.handleText(
        "Hey Jarvis, set an alarm called tea in 10 minutes.",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. set the tea alarm for 2026-07-13T16:10:00.000Z. Say yes or no.",
    });
    await expect(access(statePath)).rejects.toMatchObject({ code: "ENOENT" });

    await expect(firstRuntime.handleText("yes")).resolves.toMatchObject({
      status: "ok",
      text: "Alarm set for 2026-07-13T16:10:00.000Z (tea).",
    });
    const storedAlarms = await createFileAlarmStore({
      filePath: statePath,
      now: () => new Date("2026-07-13T16:00:00.000Z"),
    }).list();
    expect(storedAlarms).toHaveLength(1);
    expect(storedAlarms[0]?.id).not.toBe("");
    expect(storedAlarms[0]).toMatchObject({
      label: "tea",
      scheduledFor: "2026-07-13T16:10:00.000Z",
    });

    const firstList = await firstRuntime.handleText(
      "Hey Jarvis, list my alarms.",
    );
    const restartedRuntime = await createRuntime();
    const restartedList = await restartedRuntime.handleText(
      "Hey Jarvis, what alarms do I have?",
    );

    expect(firstList.text).toContain("2026-07-13T16:10:00.000Z (tea)");
    expect(restartedList).toEqual(firstList);
  }, 30_000);
});

function createLiveAlarmConfig() {
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
        confirmationRequiredCapabilities: ["alarm.create"],
        enabled: true,
        state: { path: "state/alarms.json" },
      },
    },
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  };
}
