import { line } from "../../test-support/primitives.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { writeRuntimeHarnessConfig } from "../../test-support/runtime-composition.js";
import {
  createServiceRuntimeHarness,
  createServiceSignalController,
} from "../../test-support/service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type {
  ServiceProcessSignals,
  ServiceSignal,
  ServiceTurnContext,
} from "./service-runtime.js";
import { runServiceRuntime } from "./service-runtime.js";

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

  it("returns a safe startup failure outcome and cleans up when signal registration fails", async () => {
    const unregister = vi.fn();
    const processSignals: ServiceProcessSignals = {
      onSignal(signal: ServiceSignal) {
        if (signal === "SIGTERM") {
          throw new Error("raw signal registration failure");
        }

        return unregister;
      },
    };
    const runTurn = vi.fn().mockResolvedValue(undefined);
    const harness = createServiceRuntimeHarness({
      processSignals,
      runTurn,
    });

    await expect(harness.run()).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw signal registration failure"),
    );
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("keeps running after a recoverable service turn failure", async () => {
    const retryAfterFailure = vi.fn().mockResolvedValue(undefined);
    const harness = createServiceRuntimeHarness({
      retryAfterFailure,
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
    expect(retryAfterFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failures: 1,
      }),
    );
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw turn failure"),
    );
  });

  it("uses the default fixed-delay retry policy with injected sleep after a turn failure", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const runTurn = vi
      .fn()
      .mockRejectedValueOnce(new Error("raw turn failure"))
      .mockImplementationOnce((context: ServiceTurnContext) => {
        context.requestShutdown("test complete");
        return Promise.resolve();
      });
    const harness = createServiceRuntimeHarness({
      runTurn,
    });

    await expect(
      runServiceRuntime({
        createAssistant: () =>
          Promise.resolve({
            handleText: () =>
              Promise.resolve(deterministicScenarios.alarmListEmpty.response),
            handleTextWithDiagnostics: () =>
              Promise.resolve({
                response: deterministicScenarios.alarmListEmpty.response,
              }),
          }),
        io: { stderr: harness.stderr },
        now: () => new Date("2026-06-26T09:00:00.000Z"),
        runTurn,
        sleep,
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(sleep).toHaveBeenCalledWith(1000);
    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw turn failure"),
    );
  });

  it("returns a safe failure outcome when the retry policy treats repeated turn failures as unrecoverable", async () => {
    const harness = createServiceRuntimeHarness({
      retryAfterFailure: vi.fn().mockRejectedValue(new Error("raw retry stop")),
      runTurn: vi.fn().mockRejectedValue(new Error("raw turn failure")),
    });

    await expect(harness.run()).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "failed",
      turnsCompleted: 0,
    });

    expect(harness.runTurn).toHaveBeenCalledTimes(1);
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw turn failure"),
    );
    expect(harness.stderr.writes).toContain(
      line("Runtime failure: raw retry stop"),
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
