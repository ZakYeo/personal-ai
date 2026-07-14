import { access } from "node:fs/promises";
import { env } from "node:process";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";
import { createDesktopVoiceConfig } from "../../test-support/desktop-voice-runtime.js";
import { writePersistentAlarmRuntimeConfig } from "../../test-support/runtime-composition.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runPiServiceRuntime } from "./pi-service-runtime.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("Pi service OpenAI alarms live E2E", () => {
  it("confirms and persists an OpenAI-routed alarm through Pi composition", async () => {
    const { configPath, statePath } =
      await writePersistentAlarmRuntimeConfig(createLivePiConfig());
    const signals = createServiceSignalController();

    await expect(
      runPiServiceRuntime({
        configPath,
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => new Date("2026-07-13T16:00:00.000Z"),
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async ({ assistant }) => {
          await expect(
            assistant.handleText("Set an alarm called tea in 10 minutes."),
          ).resolves.toMatchObject({
            expectsFollowUp: true,
            status: "needs_confirmation",
          });
          await expect(access(statePath)).rejects.toMatchObject({
            code: "ENOENT",
          });
          await expect(assistant.handleText("yes")).resolves.toEqual({
            status: "ok",
            text: "Alarm set for 2026-07-13T16:10:00.000Z (tea).",
          });
          const response = await assistant.handleText("List my alarms.");
          expect(response.text).toContain("2026-07-13T16:10:00.000Z (tea)");
          signals.emit("SIGTERM");

          return {
            response,
            status: "spoken",
            textOutputWritten: false,
          };
        },
      }),
    ).resolves.toEqual({ status: "stopped", turnsCompleted: 1 });
    await expect(
      createFileAlarmStore({ filePath: statePath }).list(),
    ).resolves.toMatchObject([
      {
        label: "tea",
        scheduledFor: "2026-07-13T16:10:00.000Z",
      },
    ]);
  }, 30_000);
});

function createLivePiConfig() {
  const config = createDesktopVoiceConfig("unused");

  return {
    ...config,
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
  };
}
