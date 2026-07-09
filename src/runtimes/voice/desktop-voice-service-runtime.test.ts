import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";
import type { CapturedAudio } from "../../ports/voice.js";
import {
  jsonResponse,
  TestRealtimeSocket,
} from "../../test-support/adapter-contract.js";
import { createOpenAIStreamingServiceConfig } from "../../test-support/desktop-voice-openai-service.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
  withoutDesktopWakeAudioInput,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type { ServiceTurnFailureContext } from "../service/service-runtime.js";
import type {
  VoiceActivationDependencies,
  VoiceActivationResult,
} from "./voice-activation.js";
import { runVoiceActivation } from "./voice-activation.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";
import type { DesktopVoiceServiceAdapters } from "./desktop-voice-adapter-registry.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";

const casualConversationSmokeScenarios = [
  {
    responseText: "It's going well.",
    utterance: "How's it going?",
  },
  {
    responseText: "I can answer questions and help with configured commands.",
    utterance: "What can you do?",
  },
  {
    responseText:
      "Why did the function return early? It had commitment issues.",
    utterance: "Tell me a joke.",
  },
  {
    responseText: "Paris is the capital of France.",
    utterance: "What's the capital of France?",
  },
  {
    responseText:
      "A TypeScript interface describes the shape an object should have.",
    utterance: "Explain TypeScript interfaces simply.",
  },
  {
    responseText: "You're welcome.",
    utterance: "Thanks Jarvis.",
  },
] as const;

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
    const socket = new TestRealtimeSocket({
      autoOpen: true,
      transcript: deterministicScenarios.alarmListEmpty.text,
    });
    const fetch = vi.fn(() => {
      signals.emit("SIGTERM");

      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig(),
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

  it.each(casualConversationSmokeScenarios)(
    "smoke-routes casual streaming speech through conversation: $utterance",
    async ({ responseText, utterance }) => {
      await expect(
        runCasualConversationStreamingSmoke({ responseText, utterance }),
      ).resolves.toEqual({
        fallbackOutput: [],
        progressOutput: [
          line('Now listening for wake word "hey jarvis".'),
          line("Wake word detected, now listening..."),
          utterance,
          line(`Heard: ${utterance}`),
          line(`Assistant: ${responseText}`),
        ],
        result: {
          status: "stopped",
          turnsCompleted: 1,
        },
        stderr: [],
      });
    },
  );

  it("smoke-continues streaming speech for a follow-up capability question without another wake word", async () => {
    const firstUtterance = "How are you today?";
    const followUpUtterance = "What are your capable functionalities?";
    const firstResponseText = "I am doing well. How can I help you today?";
    const sockets = [
      new TestRealtimeSocket({
        autoOpen: true,
        transcript: firstUtterance,
      }),
      new TestRealtimeSocket({
        autoOpen: true,
        transcript: followUpUtterance,
      }),
    ];
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          output_text: JSON.stringify({
            command: null,
            kind: "conversation",
            response: null,
          }),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output_text: JSON.stringify({
            expectsFollowUp: true,
            text: firstResponseText,
          }),
        }),
      )
      .mockResolvedValueOnce(new Response(Buffer.from("spoken audio")))
      .mockResolvedValueOnce(
        jsonResponse({
          output_text: JSON.stringify({
            command: {
              capability: "assistant.capabilities.list",
              parameters: [],
              rawText: followUpUtterance,
            },
            kind: "command",
            response: null,
          }),
        }),
      )
      .mockResolvedValueOnce(new Response(Buffer.from("spoken audio")));

    const result = await runDesktopVoiceServiceRuntime({
      config: {
        ...createOpenAIStreamingServiceConfig(),
        conversation: {
          history: {
            maxTurnsBeforeCompaction: 5,
          },
          openai: {
            apiKeyEnv: "OPENAI_API_KEY",
            baseUrl: "https://api.openai.test/v1",
            model: "gpt-5.5",
            timeoutMs: 30_000,
          },
          provider: "openai",
        },
        intent: {
          openai: {
            apiKeyEnv: "OPENAI_API_KEY",
            baseUrl: "https://api.openai.test/v1",
            model: "gpt-5.5",
            timeoutMs: 30_000,
          },
          provider: "openai",
        },
      },
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
      io: { fallbackOutput, progressOutput, stderr },
      processSignals: signals,
      retryAfterFailure: (context) => {
        context.requestShutdown("test failure");

        return Promise.resolve();
      },
      runVoiceActivation: async (dependencies, io) => {
        const activationResult = await runVoiceActivation(dependencies, io);
        signals.emit("SIGTERM");

        return activationResult;
      },
      webSocketFactory: (() => {
        const socket = sockets.shift();

        if (!socket) {
          throw new Error("Unexpected transcription socket request.");
        }

        return socket;
      }) satisfies RealtimeSocketFactory,
    });

    expect(result).toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      firstUtterance,
      line(`Heard: ${firstUtterance}`),
      line(`Assistant: ${firstResponseText}`),
      line("Listening for your reply..."),
      followUpUtterance,
      line(`Heard: ${followUpUtterance}`),
      line(`Assistant: ${deterministicScenarios.capabilityList.response.text}`),
    ]);
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([]);
    expect(sockets).toEqual([]);
  });

  it("fails the activation cleanly when realtime transcription never completes", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new TestRealtimeSocket({ autoOpen: true });
    const fetch = vi.fn(() => {
      signals.emit("SIGTERM");

      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig({ timeoutMs: 100 }),
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
      turnsCompleted: 1,
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
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: Realtime transcription timed out after 100ms."),
    ]);
  });

  it("cleans up streaming command audio when realtime transcription fails before audio is read", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new TestRealtimeSocket({
      autoOpen: true,
      errorOnSessionUpdate: true,
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig({
          desktopVoice: {
            streamingAudioInput: {
              ...createDesktopVoiceCommand("sleep 10"),
              timeoutMs: 30_000,
            },
          },
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch: vi.fn(() => {
          signals.emit("SIGTERM");

          return Promise.resolve(new Response(Buffer.from("spoken audio")));
        }),
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
      turnsCompleted: 1,
    });

    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
    ]);
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
    ]);
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: Realtime transcription failed."),
      line(
        'Runtime failure event: {"error":{"code":"invalid_request_error","message":"Bad transcription session.","type":"invalid_request_error"},"type":"error"}',
      ),
    ]);
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
        config: createOpenWakeWordServiceConfig("/bin/false", [
          "scripts/openwakeword-listener.py",
        ]),
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
        config: createOpenWakeWordServiceConfig(command, [
          "scripts/openwakeword-listener.py",
          "--model",
          "hey jarvis",
        ]),
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

async function runCasualConversationStreamingSmoke(input: {
  responseText: string;
  utterance: string;
}): Promise<{
  fallbackOutput: string[];
  progressOutput: string[];
  result: Awaited<ReturnType<typeof runDesktopVoiceServiceRuntime>>;
  stderr: string[];
}> {
  const signals = createServiceSignalController();
  const progressOutput = createCapturedWriter();
  const fallbackOutput = createCapturedWriter();
  const stderr = createCapturedWriter();
  const socket = new TestRealtimeSocket({
    autoOpen: true,
    transcript: input.utterance,
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        output_text: JSON.stringify({
          command: null,
          kind: "conversation",
          response: {
            status: "ok",
            text: input.responseText,
          },
        }),
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        output_text: JSON.stringify({
          expectsFollowUp: false,
          text: input.responseText,
        }),
      }),
    )
    .mockResolvedValueOnce(new Response(Buffer.from("spoken audio")));

  const result = await runDesktopVoiceServiceRuntime({
    config: {
      ...createOpenAIStreamingServiceConfig(),
      conversation: {
        history: {
          maxTurnsBeforeCompaction: 5,
        },
        openai: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://api.openai.test/v1",
          model: "gpt-5.5",
          timeoutMs: 30_000,
        },
        provider: "openai",
      },
      intent: {
        openai: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://api.openai.test/v1",
          model: "gpt-5.5",
          timeoutMs: 30_000,
        },
        provider: "openai",
      },
    },
    env: { OPENAI_API_KEY: "test-api-key" },
    fetch,
    io: { fallbackOutput, progressOutput, stderr },
    processSignals: signals,
    retryAfterFailure: (context) => {
      context.requestShutdown("test failure");

      return Promise.resolve();
    },
    runVoiceActivation: async (dependencies, io) => {
      const result = await runVoiceActivation(dependencies, io);
      signals.emit("SIGTERM");

      return result;
    },
    webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
  });

  return {
    fallbackOutput: fallbackOutput.writes,
    progressOutput: progressOutput.writes,
    result,
    stderr: stderr.writes,
  };
}

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

function createRecoveringVoiceActivation(
  signals: ReturnType<typeof createServiceSignalController>,
  message: string,
) {
  return vi
    .fn<
      (
        dependencies: VoiceActivationDependencies,
        io?: VoiceRuntimeIo,
      ) => Promise<VoiceActivationResult>
    >()
    .mockRejectedValueOnce(new Error(message))
    .mockImplementationOnce(() => {
      signals.emit("SIGTERM");

      return Promise.resolve({
        response: deterministicScenarios.alarmListEmpty.response,
        status: "spoken",
        textOutputWritten: false,
      });
    });
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

function createOpenWakeWordServiceConfig(
  command: string,
  args: string[],
): ReturnType<typeof createDesktopVoiceConfig> {
  return createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text, {
    desktopVoice: {
      wakeActivation: {
        args,
        command,
      },
    },
    voice: {
      wakeActivation: "openwakeword-command",
    },
  });
}
