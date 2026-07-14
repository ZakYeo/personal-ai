import { access } from "node:fs/promises";
import { env } from "node:process";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";
import {
  createPiServiceAdapterDoubles,
  createPiServiceAlarmFixture,
  createStopAfterPiServiceFailure,
} from "../../test-support/pi-service.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runPiServiceRuntime } from "./pi-service-runtime.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("Pi service OpenAI alarms live E2E", () => {
  it("confirms and persists an OpenAI-routed alarm through Pi composition", async () => {
    const fixture = await createPiServiceAlarmFixture();
    const signals = createServiceSignalController();
    let activationError: Error | undefined;

    try {
      const result = await runPiServiceRuntime({
        configPath: fixture.configPath,
        createVoiceAdapters: () => createPiServiceAdapterDoubles(),
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => new Date("2026-07-13T16:00:00.000Z"),
        processSignals: signals,
        retryAfterFailure: createStopAfterPiServiceFailure(signals),
        runVoiceActivation: async ({ assistant }) => {
          try {
            await expect(
              assistant.handleText("Set an alarm called tea in 10 minutes."),
            ).resolves.toMatchObject({
              expectsFollowUp: true,
              status: "needs_confirmation",
            });
            await expect(access(fixture.statePath)).rejects.toMatchObject({
              code: "ENOENT",
            });
            await expect(assistant.handleText("yes")).resolves.toEqual({
              status: "ok",
              text: "Alarm set for 2026-07-13T16:10:00.000Z (tea).",
            });
            const response = await assistant.handleText("List my alarms.");
            expect(response.text).toContain("2026-07-13T16:10:00.000Z (tea)");

            return {
              response,
              status: "spoken" as const,
              textOutputWritten: false,
            };
          } catch (error) {
            activationError =
              error instanceof Error
                ? error
                : new Error("Pi alarm activation failed.", { cause: error });
            throw activationError;
          } finally {
            signals.emit("SIGTERM");
          }
        },
      });

      if (activationError) {
        throw activationError;
      }

      expect(result).toEqual({ status: "stopped", turnsCompleted: 1 });
      await expect(
        createFileAlarmStore({ filePath: fixture.statePath }).list(),
      ).resolves.toMatchObject([
        {
          label: "tea",
          scheduledFor: "2026-07-13T16:10:00.000Z",
        },
      ]);
      expect(signals.listenerCount("SIGTERM")).toBe(0);
    } finally {
      signals.emit("SIGTERM");
      await fixture.cleanup();
    }
  }, 30_000);
});
