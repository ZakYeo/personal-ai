import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { writeRuntimeHarnessConfig } from "../../test-support/runtime-composition.js";
import type { ServiceTurnContext } from "./service-runtime.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";

describe("runConfiguredServiceRuntime", () => {
  it("composes the configured text assistant from an injected config path", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          configPath,
          now: () => new Date("2026-06-26T09:00:00.000Z"),
          retryAfterFailure: () => Promise.resolve(),
        },
        {
          validateConfig: () => {},
          runTurn: async (context: ServiceTurnContext) => {
            await expect(
              context.assistant.handleText(
                deterministicScenarios.alarmListEmpty.text,
              ),
            ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
            expect(context.configPath).toBe(configPath);

            context.requestShutdown("test complete");
          },
        },
      ),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });
  });
});
