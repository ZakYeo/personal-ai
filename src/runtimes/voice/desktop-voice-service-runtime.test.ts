import type { CapturedAudio } from "../../ports/voice.js";
import {
  createDesktopVoiceConfig,
  withoutDesktopWakeAudioInput,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type {
  VoiceActivationDependencies,
  VoiceActivationResult,
} from "./voice-activation.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";

describe("runDesktopVoiceServiceRuntime", () => {
  it("runs a configured voice activation through the service loop", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
        ),
        io: { fallbackOutput, stderr },
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async (dependencies, io) => {
          const wakeAudio = await dependencies.wakeAudioInput.capture();
          const commandAudio = await dependencies.commandAudioInput.capture();

          expect(wakeAudio.filePath).toEqual(
            expect.stringContaining("capture"),
          );
          expect(commandAudio.filePath).toEqual(
            expect.stringContaining("capture"),
          );
          expect(io).toEqual({ fallbackOutput, stderr });
          signals.emit("SIGTERM");

          return {
            response: deterministicScenarios.alarmListEmpty.response,
            status: "spoken",
            textOutputWritten: false,
            transcript: deterministicScenarios.alarmListEmpty.text,
            wakePhrase: "hey jarvis",
          };
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

  it("keeps running after a recoverable activation failure", async () => {
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
      .mockRejectedValueOnce(new Error("raw desktop voice failure"))
      .mockImplementationOnce(() => {
        signals.emit("SIGTERM");

        return Promise.resolve({
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        });
      });

    await expect(
      runDesktopVoiceServiceRuntime({
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
      line("Runtime failure: raw desktop voice failure"),
    );
  });

  it("returns a safe startup failure outcome when wake audio config is missing", async () => {
    const stderr = createCapturedWriter();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: withoutDesktopWakeAudioInput(
          createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
        ),
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
      line(
        "Runtime failure: Config desktopVoice.wakeAudioInput must be configured.",
      ),
    );
  });

  it("cleans up temporary voice files after each activation attempt", async () => {
    const signals = createServiceSignalController();
    let wakeAudio: CapturedAudio | undefined;
    let commandAudio: CapturedAudio | undefined;

    await runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
      processSignals: signals,
      retryAfterFailure: () => Promise.resolve(),
      runVoiceActivation: async (dependencies) => {
        wakeAudio = await dependencies.wakeAudioInput.capture();
        commandAudio = await dependencies.commandAudioInput.capture();
        signals.emit("SIGTERM");

        return {
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        };
      },
    });

    expect(wakeAudio?.filePath).toEqual(expect.stringContaining("capture"));
    expect(commandAudio?.filePath).toEqual(expect.stringContaining("capture"));
  });
});
