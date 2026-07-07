import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RealtimeSocket,
  RealtimeSocketFactory,
} from "../../adapters/openai/openai-realtime-transcription.js";
import type { CapturedAudio } from "../../ports/voice.js";
import {
  createDesktopVoiceCommand,
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
import type { DesktopVoiceServiceAdapters } from "./desktop-voice-adapter-registry.js";
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
                command: "/bin/sh",
                args: [
                  "-c",
                  `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
                ],
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

  it("runs wake activation through streaming command transcription and speech output", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new FakeRealtimeSocket({
      transcript: deterministicScenarios.alarmListEmpty.text,
    });
    const fetch = vi.fn(() => {
      signals.emit("SIGTERM");

      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig("", {
          desktopVoice: {
            openAIRealtimeTranscription: {
              apiKeyEnv: "OPENAI_API_KEY",
              baseUrl: "wss://api.openai.test/v1/realtime",
              model: "gpt-realtime-whisper",
              timeoutMs: 30_000,
            },
            openAIStreamingSpeech: {
              apiKeyEnv: "OPENAI_API_KEY",
              baseUrl: "https://api.openai.test/v1",
              instructions: "Speak clearly.",
              model: "gpt-4o-mini-tts",
              responseFormat: "pcm",
              voice: "coral",
            },
            streamingAudioInput: createDesktopVoiceCommand(
              "printf command-audio",
            ),
            streamingAudioOutput: createDesktopVoiceCommand("cat > /dev/null"),
            wakeActivation: createDesktopVoiceCommand(
              `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
            ),
          },
          voice: {
            streamingAudioInput: "sox-rec-stream",
            streamingAudioOutput: "sox-play-stream",
            streamingSpeechToText: "openai-realtime",
            streamingTextToSpeech: "openai-streaming",
            wakeActivation: "openwakeword-command",
          },
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch,
        io: { fallbackOutput, progressOutput, stderr },
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
        webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      deterministicScenarios.alarmListEmpty.text,
      line(`Heard: ${deterministicScenarios.alarmListEmpty.text}`),
      line(`Assistant: ${deterministicScenarios.alarmListEmpty.response.text}`),
    ]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([]);
  });

  it("fails the activation cleanly when realtime transcription never completes", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new FakeRealtimeSocket({});
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(Buffer.from("spoken audio"))),
    );

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig("", {
          desktopVoice: {
            openAIRealtimeTranscription: {
              apiKeyEnv: "OPENAI_API_KEY",
              baseUrl: "wss://api.openai.test/v1/realtime",
              model: "gpt-realtime-whisper",
              timeoutMs: 1,
            },
            openAIStreamingSpeech: {
              apiKeyEnv: "OPENAI_API_KEY",
              baseUrl: "https://api.openai.test/v1",
              instructions: "Speak clearly.",
              model: "gpt-4o-mini-tts",
              responseFormat: "pcm",
              voice: "coral",
            },
            streamingAudioInput: createDesktopVoiceCommand(
              "printf command-audio",
            ),
            streamingAudioOutput: createDesktopVoiceCommand("cat > /dev/null"),
            wakeActivation: createDesktopVoiceCommand(
              `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
            ),
          },
          voice: {
            streamingAudioInput: "sox-rec-stream",
            streamingAudioOutput: "sox-play-stream",
            streamingSpeechToText: "openai-realtime",
            streamingTextToSpeech: "openai-streaming",
            wakeActivation: "openwakeword-command",
          },
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch,
        io: { fallbackOutput, progressOutput, stderr },
        processSignals: signals,
        retryAfterFailure: (context) => {
          context.requestShutdown("test complete");

          return Promise.resolve();
        },
        webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 0,
    });

    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
    ]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
    expect(socket.closed).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: Realtime transcription timed out after 1ms."),
    ]);
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

  it.each([
    {
      failure: "wake microphone unavailable",
      mode: "wake-audio" as const,
    },
    {
      failure: "wake stt unavailable",
      mode: "wake-stt" as const,
    },
    {
      failure: "command microphone unavailable",
      mode: "command-audio" as const,
    },
    {
      failure: "command stt unavailable",
      mode: "command-stt" as const,
    },
  ])(
    "retries real activation after $mode infrastructure failure",
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

  it("returns a safe startup failure outcome when streaming transcription config is partial", async () => {
    const stderr = createCapturedWriter();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
          {
            voice: {
              streamingAudioInput: "sox-rec-stream",
            },
          },
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
        "Runtime failure: Config voice.streamingAudioInput and voice.streamingSpeechToText must be configured together.",
      ),
    );
  });

  it("fails startup once with OpenWakeWord setup guidance when the local Python listener dependency is missing", async () => {
    const stderr = createCapturedWriter();
    const runVoiceActivation = vi.fn();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
          {
            desktopVoice: {
              wakeActivation: {
                args: ["scripts/openwakeword-listener.py"],
                command: "/bin/false",
              },
            },
            voice: {
              wakeActivation: "openwakeword-command",
            },
          },
        ),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation,
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(runVoiceActivation).not.toHaveBeenCalled();
    expect(stderr.writes).toEqual([
      line(
        'Runtime failure: OpenWakeWord startup check failed for desktopVoice.wakeActivation command "/bin/false". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".',
      ),
    ]);
  });

  it("fails startup once when the local OpenWakeWord listener startup check fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-oww-"));
    const command = join(directory, "python");
    await writeFile(
      command,
      [
        "#!/usr/bin/env sh",
        'if [ "$1" = "-c" ]; then',
        "  exit 0",
        "fi",
        'for arg in "$@"; do',
        '  if [ "$arg" = "--startup-check" ]; then',
        "    echo 'listener constructor failed' >&2",
        "    exit 1",
        "  fi",
        "done",
        'printf \'%s\\n\' \'{"type":"wake","phrase":"hey jarvis"}\'',
      ].join("\n"),
    );
    await chmod(command, 0o755);

    const stderr = createCapturedWriter();
    const runVoiceActivation = vi.fn();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
          {
            desktopVoice: {
              wakeActivation: {
                args: [
                  "scripts/openwakeword-listener.py",
                  "--model",
                  "hey jarvis",
                ],
                command,
              },
            },
            voice: {
              wakeActivation: "openwakeword-command",
            },
          },
        ),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation,
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(runVoiceActivation).not.toHaveBeenCalled();
    expect(stderr.writes).toEqual([
      line(
        `Runtime failure: OpenWakeWord startup check failed for desktopVoice.wakeActivation command "${command}". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".`,
      ),
    ]);
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

type InfrastructureFailureMode =
  | "command-audio"
  | "command-stt"
  | "wake-audio"
  | "wake-stt";

function createInfrastructureFailureAdapters(
  mode: InfrastructureFailureMode,
  message: string,
): DesktopVoiceServiceAdapters {
  const adapters = createSuccessfulActivationAdapters();
  let transcriptions = 0;

  if (mode === "wake-audio") {
    return {
      ...adapters,
      wakeAudioInput: {
        capture: () => Promise.reject(new Error(message)),
      },
    };
  }

  if (mode === "command-audio") {
    return {
      ...adapters,
      audioInput: {
        capture: () => Promise.reject(new Error(message)),
      },
    };
  }

  return {
    ...adapters,
    speechToText: {
      transcribe: (audio) => {
        transcriptions += 1;

        if (
          (mode === "wake-stt" && transcriptions === 1) ||
          (mode === "command-stt" && transcriptions === 2)
        ) {
          return Promise.reject(new Error(message));
        }

        return Promise.resolve({ text: audio.text });
      },
    },
  };
}

function createSuccessfulActivationAdapters(
  onPlay?: () => void,
): DesktopVoiceServiceAdapters {
  return {
    audioInput: {
      capture: () =>
        Promise.resolve({
          text: deterministicScenarios.alarmListEmpty.text,
        }),
    },
    audioOutput: {
      play: () => {
        onPlay?.();
        return Promise.resolve();
      },
    },
    speechToText: {
      transcribe: (audio) => Promise.resolve({ text: audio.text }),
    },
    textToSpeech: {
      synthesize: (text) => Promise.resolve({ text }),
    },
    wakeAudioInput: {
      capture: () => Promise.resolve({ text: "Hey Jarvis" }),
    },
    wakeWord: {
      detect: () =>
        Promise.resolve({
          detected: true,
          phrase: "hey jarvis",
        }),
    },
  };
}

class FakeRealtimeSocket implements RealtimeSocket {
  closed = false;
  readonly sentMessages: Array<Record<string, unknown>> = [];
  private readonly listeners: Record<string, Array<(event?: unknown) => void>> =
    {};

  constructor(private readonly options: { transcript?: string }) {}

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];

    if (type === "open") {
      queueMicrotask(() => {
        this.emit("open");
      });
    }
  }

  close(): void {
    this.closed = true;
  }

  send(message: string): void {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    this.sentMessages.push(parsed);

    if (parsed.type === "input_audio_buffer.commit") {
      queueMicrotask(() => {
        if (this.closed || this.options.transcript === undefined) {
          return;
        }

        this.emitMessage({
          delta: this.options.transcript,
          type: "conversation.item.input_audio_transcription.delta",
        });
        this.emitMessage({
          transcript: this.options.transcript,
          type: "conversation.item.input_audio_transcription.completed",
        });
      });
    }
  }

  private emitMessage(message: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event?: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}
