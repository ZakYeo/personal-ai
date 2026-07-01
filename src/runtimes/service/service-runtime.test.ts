import { line } from "../../test-support/primitives.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { writeRuntimeHarnessConfig } from "../../test-support/runtime-composition.js";
import {
  createServiceRuntimeHarness,
  createServiceSignalController,
} from "../../test-support/service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type { ServiceTurnContext } from "./service-runtime.js";

describe("runServiceRuntime", () => {
  it("can compose the configured text assistant from an injected config path", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );
    const harness = createServiceRuntimeHarness({
      configPath,
      useConfiguredAssistant: true,
      runTurn: vi
        .fn()
        .mockImplementation(async (context: ServiceTurnContext) => {
          await expect(
            context.assistant.handleText(
              deterministicScenarios.alarmListEmpty.text,
            ),
          ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
          expect(context.configPath).toBe(configPath);

          context.requestShutdown("test complete");
        }),
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });
  });

  it("returns a safe startup failure outcome when assistant composition fails", async () => {
    const harness = createServiceRuntimeHarness({
      createAssistant: () => Promise.reject(new Error("raw startup failure")),
    });

    await expect(harness.run()).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw startup failure"),
    );
  });

  it("keeps running after a recoverable service turn failure", async () => {
    const harness = createServiceRuntimeHarness({
      runTurn: vi
        .fn()
        .mockRejectedValueOnce(new Error("raw turn failure"))
        .mockImplementationOnce((context: ServiceTurnContext) => {
          context.requestShutdown("test complete");
          return Promise.resolve();
        }),
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(harness.runTurn).toHaveBeenCalledTimes(2);
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw turn failure"),
    );
  });

  it("handles injected shutdown signals and runs shutdown hooks", async () => {
    const signals = createServiceSignalController();
    const shutdownHook = vi.fn().mockResolvedValue(undefined);
    const harness = createServiceRuntimeHarness({
      processSignals: signals,
      shutdownHooks: [shutdownHook],
      runTurn: vi.fn().mockImplementation(() => {
        signals.emit("SIGTERM");
        return Promise.resolve();
      }),
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(shutdownHook).toHaveBeenCalledWith({
      reason: "signal:SIGTERM",
      signal: "SIGTERM",
    });
    expect(harness.stderr.writes).toEqual([]);
  });
});
