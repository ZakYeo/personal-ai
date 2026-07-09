import type { RealtimeSocketFactory } from "../adapters/openai/openai-realtime-transcription.js";
import type { DesktopVoiceServiceAdapters } from "../runtimes/voice/desktop-voice-adapter-registry.js";
import { runDesktopVoiceServiceRuntime } from "../runtimes/voice/desktop-voice-service-runtime.js";
import {
  runVoiceActivation,
  type VoiceActivationDependencies,
  type VoiceActivationResult,
} from "../runtimes/voice/voice-activation.js";
import type { VoiceRuntimeIo } from "../runtimes/voice/voice-turn.js";
import type { ServiceTurnFailureContext } from "../runtimes/service/service-runtime.js";
import { jsonResponse, TestRealtimeSocket } from "./adapter-contract.js";
import {
  createOpenAIConversationStreamingServiceConfig,
  createQueuedRealtimeSocketFactory,
} from "./desktop-voice-openai-service.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
} from "./desktop-voice-runtime.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import { createCapturedWriter } from "./primitives.js";
import { createServiceSignalController } from "./service-runtime.js";

export const casualConversationSmokeScenarios = [
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

export async function runCasualConversationStreamingSmoke(input: {
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

  const result = await runOpenAIConversationStreamingActivationSmoke({
    fallbackOutput,
    fetch,
    progressOutput,
    signals,
    stderr,
    webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
  });

  return {
    fallbackOutput: fallbackOutput.writes,
    progressOutput: progressOutput.writes,
    result,
    stderr: stderr.writes,
  };
}

export function createFollowUpRealtimeSmoke(): {
  fallbackOutput: ReturnType<typeof createCapturedWriter>;
  fetch: typeof fetch;
  firstResponseText: string;
  firstUtterance: string;
  followUpUtterance: string;
  progressOutput: ReturnType<typeof createCapturedWriter>;
  signals: ReturnType<typeof createServiceSignalController>;
  sockets: ReturnType<typeof createQueuedRealtimeSocketFactory>["sockets"];
  stderr: ReturnType<typeof createCapturedWriter>;
  webSocketFactory: RealtimeSocketFactory;
} {
  const firstUtterance = "How are you today?";
  const followUpUtterance = "What are your capable functionalities?";
  const firstResponseText = "I am doing well. How can I help you today?";
  const { sockets, webSocketFactory } = createQueuedRealtimeSocketFactory([
    firstUtterance,
    followUpUtterance,
  ]);

  return {
    fallbackOutput: createCapturedWriter(),
    fetch: vi
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
      .mockResolvedValueOnce(new Response(Buffer.from("spoken audio"))),
    firstResponseText,
    firstUtterance,
    followUpUtterance,
    progressOutput: createCapturedWriter(),
    signals: createServiceSignalController(),
    sockets,
    stderr: createCapturedWriter(),
    webSocketFactory,
  };
}

export async function runOpenAIConversationStreamingActivationSmoke(options: {
  fallbackOutput: ReturnType<typeof createCapturedWriter>;
  fetch: typeof fetch;
  progressOutput: ReturnType<typeof createCapturedWriter>;
  signals: ReturnType<typeof createServiceSignalController>;
  stderr: ReturnType<typeof createCapturedWriter>;
  webSocketFactory: RealtimeSocketFactory;
}): Promise<Awaited<ReturnType<typeof runDesktopVoiceServiceRuntime>>> {
  return runDesktopVoiceServiceRuntime({
    config: createOpenAIConversationStreamingServiceConfig(),
    env: { OPENAI_API_KEY: "test-api-key" },
    fetch: options.fetch,
    io: {
      fallbackOutput: options.fallbackOutput,
      progressOutput: options.progressOutput,
      stderr: options.stderr,
    },
    processSignals: options.signals,
    retryAfterFailure: (context) => {
      context.requestShutdown("test failure");

      return Promise.resolve();
    },
    runVoiceActivation: async (dependencies, io) => {
      const result = await runVoiceActivation(dependencies, io);
      options.signals.emit("SIGTERM");

      return result;
    },
    webSocketFactory: options.webSocketFactory,
  });
}

type InfrastructureFailureMode =
  | "command-audio"
  | "command-stt"
  | "wake-audio"
  | "wake-stt";

export function createInfrastructureFailureAdapters(
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

export function createRecoveringVoiceActivation(
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

export function createSuccessfulActivationAdapters(
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

export function createOpenWakeWordServiceConfig(
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

export function createSleepingStreamingAudioConfig(): ReturnType<
  typeof createDesktopVoiceCommand
> {
  return {
    ...createDesktopVoiceCommand("sleep 10"),
    timeoutMs: 30_000,
  };
}

export type { ServiceTurnFailureContext };
