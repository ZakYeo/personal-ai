import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { writeRuntimeHarnessConfig } from "../../test-support/runtime-composition.js";
import type { ServiceTurnContext } from "./service-runtime.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

  it("forwards the loaded config directory to persistent alarm storage", async () => {
    const configPath = await writeRuntimeHarnessConfig({
      ...enabledDeterministicConfig,
      features: {
        ...enabledDeterministicConfig.features,
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: "state/alarms.json" },
        },
      },
    });
    const stateDirectory = join(dirname(configPath), "state");
    await mkdir(stateDirectory);
    await writeFile(
      join(stateDirectory, "alarms.json"),
      JSON.stringify({
        alarms: [
          {
            id: "service-alarm",
            label: "tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
        version: 1,
      }),
    );

    await runConfiguredServiceRuntime(
      {
        configPath,
        retryAfterFailure: () => Promise.resolve(),
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          const response = await context.assistant.handleText(
            deterministicScenarios.alarmListEmpty.text,
          );
          expect(response.text).toContain("service-alarm");
          context.requestShutdown("test complete");
        },
      },
    );
  });

  it("passes the loaded config context to startup validation", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          configPath,
          retryAfterFailure: () => Promise.resolve(),
        },
        {
          validateConfig: (_config, dependencies) => {
            expect(dependencies.configDirectory).toBe(dirname(configPath));
          },
          runTurn: (context) => {
            context.requestShutdown("test complete");
            return Promise.resolve();
          },
        },
      ),
    ).resolves.toMatchObject({ status: "stopped" });
  });
});
