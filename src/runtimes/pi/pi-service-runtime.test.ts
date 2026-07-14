import type { CapturedAudio } from "../../ports/voice.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createDesktopVoiceConfig } from "../../test-support/desktop-voice-runtime.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import {
  createPiServiceAdapterDoubles,
  createPiServiceAlarmFixture,
  createStopAfterPiServiceFailure,
} from "../../test-support/pi-service.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type {
  VoiceActivationDependencies,
  VoiceActivationResult,
} from "../voice/voice-activation.js";
import type { VoiceRuntimeIo } from "../voice/voice-turn.js";
import { runPiServiceRuntime } from "./pi-service-runtime.js";
import { writePersistentAlarmRuntimeConfig } from "../../test-support/runtime-composition.js";

describe("runPiServiceRuntime", () => {
  it("confirms and executes a compound plan through Pi service composition", async () => {
    const signals = createServiceSignalController();
    const utterance =
      "Hey Jarvis, check my calendar for upcoming events and set an alarm to tea in 10 minutes";

    await expect(
      runPiServiceRuntime({
        config: createDesktopVoiceConfig(utterance),
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async ({ assistant }) => {
          const prompt = await assistant.handleText(utterance);
          expect(prompt).toMatchObject({
            expectsFollowUp: true,
            status: "needs_confirmation",
            text: expect.stringContaining("set the tea alarm") as string,
          });
          const response = await assistant.handleText("yes");
          expect(response).toMatchObject({
            status: "ok",
            text: expect.stringContaining("Alarm set") as string,
          });
          signals.emit("SIGTERM");
          return {
            response,
            status: "spoken",
            textOutputWritten: false,
          };
        },
      }),
    ).resolves.toEqual({ status: "stopped", turnsCompleted: 1 });
  });

  it("runs a configured command voice turn through the service loop", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();

    await expect(
      runPiServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
        ),
        io: { fallbackOutput, stderr },
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async (dependencies, io) => {
          const result = await dependencies.commandAudioInput.capture();

          expect(result.filePath).toEqual(expect.stringContaining("capture"));
          expect(dependencies.wakeAudioInput).toBeDefined();
          expect(io).toEqual({ fallbackOutput, stderr });
          signals.emit("SIGTERM");

          return dependencies.assistant
            .handleTextWithDiagnostics(
              deterministicScenarios.alarmListEmpty.text,
            )
            .then(({ response }): VoiceActivationResult => {
              return {
                response,
                status: "spoken",
                textOutputWritten: false,
                transcript: deterministicScenarios.alarmListEmpty.text,
                wakePhrase: "hey jarvis",
              };
            });
        },
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(stderr.writes).toEqual([]);
    expect(fallbackOutput.writes).toEqual([]);
  });

  it("resolves persistent alarm state relative to the Pi config", async () => {
    const config = createDesktopVoiceConfig(
      deterministicScenarios.alarmListEmpty.text,
    );
    const { configPath } = await writePersistentAlarmRuntimeConfig(config, {
      alarms: [
        {
          id: "pi-alarm",
          label: "tea",
          scheduledFor: "2026-07-13T17:00:00.000Z",
        },
      ],
    });
    const signals = createServiceSignalController();

    await expect(
      runPiServiceRuntime({
        configPath,
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async ({ assistant }) => {
          const response = await assistant.handleText(
            deterministicScenarios.alarmListEmpty.text,
          );
          expect(response.text).toContain("pi-alarm");
          signals.emit("SIGTERM");

          return {
            response,
            status: "spoken",
            textOutputWritten: false,
          };
        },
      }),
    ).resolves.toMatchObject({ status: "stopped" });
  });

  it("keeps running after a recoverable voice turn failure", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const retryAfterFailure = vi.fn().mockResolvedValue(undefined);
    const runVoiceActivation = vi
      .fn<
        (
          dependencies: VoiceActivationDependencies,
          io?: VoiceRuntimeIo,
        ) => Promise<VoiceActivationResult>
      >()
      .mockRejectedValueOnce(new Error("raw pi voice failure"))
      .mockImplementationOnce(() => {
        signals.emit("SIGTERM");

        return Promise.resolve({
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        });
      });

    await expect(
      runPiServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
        ),
        io: { stderr },
        processSignals: signals,
        retryAfterFailure,
        runVoiceActivation,
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(runVoiceActivation).toHaveBeenCalledTimes(2);
    expect(retryAfterFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failures: 1 }),
    );
    expect(stderr.writes).toContain(
      line("Runtime failure: raw pi voice failure"),
    );
  });

  it("stops smoke-style composition after its first activation failure", async () => {
    const fixture = await createPiServiceAlarmFixture();
    const signals = createServiceSignalController();
    const runVoiceActivation = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));

    try {
      await expect(
        runPiServiceRuntime({
          configPath: fixture.configPath,
          createVoiceAdapters: () => createPiServiceAdapterDoubles(),
          env: { OPENAI_API_KEY: "test-key" },
          fetch: vi.fn() as typeof fetch,
          processSignals: signals,
          retryAfterFailure: createStopAfterPiServiceFailure(signals),
          runVoiceActivation,
        }),
      ).resolves.toEqual({ status: "stopped", turnsCompleted: 0 });

      expect(runVoiceActivation).toHaveBeenCalledOnce();
    } finally {
      signals.emit("SIGTERM");
      await fixture.cleanup();
    }
  });

  it("returns a safe startup failure outcome when Pi voice config is invalid", async () => {
    const stderr = createCapturedWriter();
    const invalidConfig: LoadedRuntimeConfig = {
      ...createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    };

    delete invalidConfig.voice;

    await expect(
      runPiServiceRuntime({
        config: invalidConfig,
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: () => {
          throw new Error("should not run");
        },
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(stderr.writes).toContain(
      line("Runtime failure: Config voice.input must be configured."),
    );
  });

  it("cleans up temporary voice files after each service turn", async () => {
    const signals = createServiceSignalController();
    let capturedAudio: CapturedAudio | undefined;

    await runPiServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
      processSignals: signals,
      retryAfterFailure: () => Promise.resolve(),
      runVoiceActivation: async (dependencies) => {
        capturedAudio = await dependencies.commandAudioInput.capture();
        signals.emit("SIGTERM");

        return {
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        };
      },
    });

    expect(capturedAudio?.filePath).toEqual(expect.stringContaining("capture"));
  });

  it("logs cleanup failures without failing the service turn", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const retryAfterFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runPiServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
        ),
        createVoiceAdapters: () => ({
          audioInput: {
            capture: () =>
              Promise.resolve({
                text: deterministicScenarios.alarmListEmpty.text,
              }),
          },
          audioOutput: {
            play: () => Promise.resolve(),
          },
          cleanup: () => Promise.reject(new Error("cleanup failed")),
          speechToText: {
            transcribe: () =>
              Promise.resolve({
                text: deterministicScenarios.alarmListEmpty.text,
              }),
          },
          textToSpeech: {
            synthesize: (text) => Promise.resolve({ text }),
          },
          wakeWord: {
            detect: () =>
              Promise.resolve({
                detected: true,
                phrase: "hey jarvis",
              }),
          },
          wakeAudioInput: {
            capture: () => Promise.resolve({ text: "Hey Jarvis" }),
          },
        }),
        io: { stderr },
        processSignals: signals,
        retryAfterFailure,
        runVoiceActivation: () => {
          signals.emit("SIGTERM");

          return Promise.resolve({
            response: deterministicScenarios.alarmListEmpty.response,
            status: "spoken",
            textOutputWritten: false,
          });
        },
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(retryAfterFailure).not.toHaveBeenCalled();
    expect(stderr.writes).toContain(line("Runtime failure: cleanup failed"));
  });
});
