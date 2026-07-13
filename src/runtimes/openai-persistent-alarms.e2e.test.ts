import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "node:process";
import { createFileAlarmStore } from "../adapters/local/file-alarm-store.js";
import { writeTempJsonFile } from "../test-support/primitives.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI persistent alarms live E2E", () => {
  it("routes safe creation and lists durable alarms after restart", async () => {
    const configPath = await writeTempJsonFile(createLiveAlarmConfig());
    const statePath = join(dirname(configPath), "state", "alarms.json");
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
      status: "needs_confirmation",
      text: "I need confirmation before doing that. Please confirm yes or no.",
    });
    await expect(access(statePath)).rejects.toMatchObject({ code: "ENOENT" });

    await createFileAlarmStore({
      createId: () => "live-persisted-alarm",
      filePath: statePath,
    }).add({
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

    expect(firstList.text).toContain("live-persisted-alarm");
    expect(restartedList).toEqual(firstList);
  });
});

function createLiveAlarmConfig() {
  return {
    assistant: {
      name: "Jarvis",
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
