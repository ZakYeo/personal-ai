import { createDeterministicRuntime } from "../deterministic-runtime.js";
import {
  MockAudioInput,
  MockAudioOutput,
  MockSpeechToText,
  MockTextToSpeech,
  MockWakeWordDetector,
} from "../../adapters/mock/mock-voice-adapters.js";
import type { Assistant } from "../../core/assistant/index.js";
import type { AppError } from "../../core/assistant/app-error.js";
import type {
  AssistantConfig,
  AssistantResponse,
} from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import { loadConfig } from "../config/config.js";

const fallbackResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}

export interface VoiceRuntimeDependencies {
  assistant: Assistant;
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  config: AssistantConfig;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

interface VoiceTurnResult {
  response: AssistantResponse;
  status: "spoken" | "ignored" | "fallback_output";
  transcript?: string;
  wakePhrase?: string;
}

interface MockVoiceRuntimeOptions {
  config?: AssistantConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  now?: Date;
  utterance?: string;
}

interface MockVoiceRuntime {
  runOnce(): Promise<VoiceTurnResult>;
}

export async function createMockVoiceRuntime(
  options: MockVoiceRuntimeOptions = {},
): Promise<MockVoiceRuntime> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const utterance =
    options.utterance ??
    "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?";

  assertMockVoiceConfig(config);

  const dependencies: VoiceRuntimeDependencies = {
    assistant: await createDeterministicRuntime({
      config,
      ...(options.now ? { now: options.now } : {}),
    }),
    audioInput: new MockAudioInput(utterance),
    audioOutput: new MockAudioOutput(options.io?.fallbackOutput),
    config,
    speechToText: new MockSpeechToText(),
    textToSpeech: new MockTextToSpeech(),
    wakeWord: new MockWakeWordDetector(),
  };

  return {
    runOnce: () => runVoiceTurn(dependencies, options.io),
  };
}

export async function runVoiceTurn(
  dependencies: VoiceRuntimeDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceTurnResult> {
  try {
    const audio = await dependencies.audioInput.capture();
    const detection = await dependencies.wakeWord.detect({
      audio,
      wakePhrases: dependencies.config.assistant.wakePhrases,
    });

    if (!detection.detected) {
      return {
        response: {
          status: "unknown",
          text: "Wake phrase not detected.",
        },
        status: "ignored",
      };
    }

    const transcript = await dependencies.speechToText.transcribe(audio);
    const response = await handleAssistantText(
      dependencies.assistant,
      transcript.text,
      io,
    );
    const status = await speakResponse(dependencies, response, io);

    return {
      response,
      status,
      transcript: transcript.text,
      ...(detection.phrase ? { wakePhrase: detection.phrase } : {}),
    };
  } catch (error) {
    logRuntimeFailure(error, io);

    const status = await speakResponse(dependencies, fallbackResponse, io);

    return {
      response: fallbackResponse,
      status,
    };
  }
}

async function handleAssistantText(
  assistant: Assistant,
  text: string,
  io: VoiceRuntimeIo,
): Promise<AssistantResponse> {
  try {
    const outcome = await assistant.handleTextWithDiagnostics(text);

    logDiagnostics(outcome.diagnostics ?? [], io);

    return outcome.response;
  } catch (error) {
    logRuntimeFailure(error, io);

    return fallbackResponse;
  }
}

async function speakResponse(
  dependencies: VoiceRuntimeDependencies,
  response: AssistantResponse,
  io: VoiceRuntimeIo,
): Promise<VoiceTurnResult["status"]> {
  try {
    const speech = await dependencies.textToSpeech.synthesize(response.text);
    await dependencies.audioOutput.play(speech);

    return "spoken";
  } catch (error) {
    logRuntimeFailure(error, io);
    io.fallbackOutput?.write(`${response.text}\n`);

    return "fallback_output";
  }
}

function assertMockVoiceConfig(config: AssistantConfig): void {
  const voice = config.voice ?? {};

  assertRegisteredVoiceAdapter("input", voice.input);
  assertRegisteredVoiceAdapter("wakeWord", voice.wakeWord);
  assertRegisteredVoiceAdapter("speechToText", voice.speechToText);
  assertRegisteredVoiceAdapter("textToSpeech", voice.textToSpeech);
  assertRegisteredVoiceAdapter("audioOutput", voice.audioOutput);
}

function assertRegisteredVoiceAdapter(
  key: keyof NonNullable<AssistantConfig["voice"]>,
  adapter: string | undefined,
): void {
  if (adapter !== undefined && adapter !== "mock") {
    throw new Error(`Config voice.${key} "${adapter}" is not registered.`);
  }
}

function logDiagnostics(diagnostics: AppError[], io: VoiceRuntimeIo): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.category === "feature_failure") {
      const capability = diagnostic.capability
        ? ` in ${diagnostic.capability}`
        : "";

      io.stderr?.write(`Feature failure${capability}: ${diagnostic.message}\n`);

      if (diagnostic.cause !== undefined) {
        io.stderr?.write(
          `Feature failure cause${capability}: ${formatDiagnosticCause(diagnostic.cause)}\n`,
        );
      }
    }
  }
}

function logRuntimeFailure(error: unknown, io: VoiceRuntimeIo): void {
  const message = error instanceof Error ? error.message : String(error);

  io.stderr?.write(`Runtime failure: ${message}\n`);
}

function formatDiagnosticCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack ?? cause.message;
  }

  return String(cause);
}
