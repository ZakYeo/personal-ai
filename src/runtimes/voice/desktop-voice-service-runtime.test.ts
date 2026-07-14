import type { CapturedAudio } from "../../ports/voice.js";
import {
  createInfrastructureFailureAdapters,
  createRecoveringVoiceActivation,
  createSuccessfulActivationAdapters,
  type ServiceTurnFailureContext,
} from "../../test-support/desktop-voice-service.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";

describe("runDesktopVoiceServiceRuntime", () => {
  it("delivers scheduled alarms through configured voice output", async () => {
    const signals = createServiceSignalController();
    const synthesize = vi.fn().mockResolvedValue({
      filePath: "/tmp/alarm.wav",
      text: "Alarm: ping me.",
    });
    let resolveDelivered: (() => void) | undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });
    const play = vi.fn().mockImplementation(() => {
      resolveDelivered?.();
      signals.emit("SIGTERM");
      return Promise.resolve();
    });
    let startBackgroundTask: (() => void) | undefined;
    const backgroundTaskReady = new Promise<void>((resolve) => {
      startBackgroundTask = resolve;
    });
    let now = new Date("2026-07-14T09:00:00.000Z");

    await runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
      createVoiceAdapters: () => ({
        ...createSuccessfulActivationAdapters(),
      }),
      createVoiceOutputAdapters: () => ({
        audioOutput: { play },
        textToSpeech: { synthesize },
      }),
      now: () => now,
      processSignals: signals,
      runBackgroundTask: (task, context) =>
        backgroundTaskReady.then(() => task.run(context)),
      runVoiceActivation: async (dependencies) => {
        await dependencies.assistant.handleText(
          "Hey Jarvis, set an alarm to ping me in 10 minutes.",
        );
        await dependencies.assistant.handleText("yes");
        now = new Date("2026-07-14T09:10:00.000Z");
        startBackgroundTask?.();
        await delivered;
        return {
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        };
      },
    });

    expect(synthesize).toHaveBeenCalledExactlyOnceWith("Alarm: ping me.");
    expect(play).toHaveBeenCalledExactlyOnceWith({
      filePath: "/tmp/alarm.wav",
      text: "Alarm: ping me.",
    });
  });

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

  it("composes configured local wake activation for the service loop", async () => {
    const signals = createServiceSignalController();
    const wakeEvents: string[] = [];

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
          {
            desktopVoice: {
              wakeActivation: {
                args: [
                  "-c",
                  `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
                ],
                command: "/bin/sh",
              },
            },
            voice: {
              wakeActivation: "openwakeword-command",
            },
          },
        ),
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: async (dependencies) => {
          const activation = await dependencies.wakeActivation?.waitForWake({
            wakePhrases: ["hey jarvis"],
          });

          wakeEvents.push(activation?.phrase ?? "");
          signals.emit("SIGTERM");

          return {
            response: deterministicScenarios.alarmListEmpty.response,
            status: "spoken",
            textOutputWritten: false,
          };
        },
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(wakeEvents).toEqual(["hey jarvis"]);
  });

  it("stops cleanly when a shutdown signal aborts wake activation", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const killedProcessGroups: number[] = [];

    const result = runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
        {
          desktopVoice: {
            wakeActivation: {
              args: ["-c", "sleep 10"],
              command: "/bin/sh",
              timeoutMs: 10_000,
            },
          },
          voice: {
            wakeActivation: "openwakeword-command",
          },
        },
      ),
      io: { stderr },
      processControl: {
        kill: (pid, signal) => {
          killedProcessGroups.push(pid);
          process.kill(pid, signal);
        },
        platform: "linux",
      },
      processSignals: signals,
      retryAfterFailure: () => Promise.resolve(),
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    signals.emit("SIGINT");

    await expect(result).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 0,
    });
    expect(killedProcessGroups).toHaveLength(1);
    expect(killedProcessGroups[0]).toBeLessThan(0);
    expect(stderr.writes).toEqual([]);
  });

  it("keeps running after a recoverable activation failure", async () => {
    const signals = createServiceSignalController();
    const stderr = createCapturedWriter();
    const retryAfterFailure = vi.fn().mockResolvedValue(undefined);
    const runVoiceActivation = createRecoveringVoiceActivation(
      signals,
      "raw desktop voice failure",
    );

    await expect(
      runRecoverableDesktopActivationFailure({
        retryAfterFailure,
        runVoiceActivation,
        signals,
        stderr,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    { failure: "wake microphone unavailable", mode: "wake-audio" as const },
    { failure: "wake stt unavailable", mode: "wake-stt" as const },
  ])(
    "retries real activation after pre-wake $mode infrastructure failure",
    async ({ failure, mode }) => {
      const signals = createServiceSignalController();
      const stderr = createCapturedWriter();
      const retryAfterFailure = vi.fn().mockResolvedValue(undefined);
      let adapterCreations = 0;

      await expect(
        runDesktopVoiceServiceRuntime({
          config: createDesktopVoiceConfig(
            deterministicScenarios.alarmListEmpty.text,
          ),
          createVoiceAdapters: () => {
            adapterCreations += 1;

            if (adapterCreations === 1) {
              return createInfrastructureFailureAdapters(mode, failure);
            }

            return createSuccessfulActivationAdapters(() => {
              signals.emit("SIGTERM");
            });
          },
          io: { stderr },
          processSignals: signals,
          retryAfterFailure,
        }),
      ).resolves.toEqual({
        status: "stopped",
        turnsCompleted: 1,
      });

      expect(adapterCreations).toBe(2);
      expect(retryAfterFailure).toHaveBeenCalledWith(
        expect.objectContaining({ failures: 1 }),
      );
      expect(stderr.writes).toContain(line(`Runtime failure: ${failure}`));
    },
  );

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

  it("cleans up desktop voice temp files after a service turn", async () => {
    const signals = createServiceSignalController();
    const spokenFiles: string[] = [];

    await runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
        {
          desktopVoice: {
            audioOutput: createDesktopVoiceCommand(
              "printf '%s' \"$1\"",
              "{input}",
            ),
          },
        },
      ),
      processSignals: signals,
      retryAfterFailure: () => Promise.resolve(),
      runVoiceActivation: async (dependencies) => {
        const speech = await dependencies.textToSpeech.synthesize("done");
        await dependencies.audioOutput.play(speech);
        spokenFiles.push(speech.filePath ?? "");
        signals.emit("SIGTERM");

        return {
          response: deterministicScenarios.alarmListEmpty.response,
          status: "spoken",
          textOutputWritten: false,
        };
      },
    });

    expect(spokenFiles[0]).toEqual(expect.stringContaining("speech"));
  });
});

async function runRecoverableDesktopActivationFailure(options: {
  retryAfterFailure: (context: ServiceTurnFailureContext) => Promise<void>;
  runVoiceActivation: ReturnType<typeof createRecoveringVoiceActivation>;
  signals: ReturnType<typeof createServiceSignalController>;
  stderr: ReturnType<typeof createCapturedWriter>;
}): Promise<void> {
  await expect(
    runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
      io: { stderr: options.stderr },
      processSignals: options.signals,
      retryAfterFailure: options.retryAfterFailure,
      runVoiceActivation: options.runVoiceActivation,
    }),
  ).resolves.toEqual({
    status: "stopped",
    turnsCompleted: 1,
  });

  expect(options.runVoiceActivation).toHaveBeenCalledTimes(2);
  expect(options.retryAfterFailure).toHaveBeenCalledWith(
    expect.objectContaining({ failures: 1 }),
  );
  expect(options.stderr.writes).toContain(
    line("Runtime failure: raw desktop voice failure"),
  );
}
