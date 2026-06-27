import { createDeterministicRuntime } from "../deterministic-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import {
  runVoiceTurn,
  type VoiceRuntimeDependencies,
  type VoiceRuntimeIo,
  type VoiceTurnResult,
} from "./voice-turn.js";
import { createMockVoiceAdapters } from "./mock-voice-adapter-registry.js";

interface MockVoiceRuntimeOptions {
  config?: LoadedRuntimeConfig;
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

  const voiceAdapters = createMockVoiceAdapters(config, { utterance });

  const dependencies: VoiceRuntimeDependencies = {
    assistant: await createDeterministicRuntime({
      config,
      ...(options.now ? { now: options.now } : {}),
    }),
    audioInput: voiceAdapters.audioInput,
    audioOutput: voiceAdapters.audioOutput,
    config,
    speechToText: voiceAdapters.speechToText,
    textToSpeech: voiceAdapters.textToSpeech,
    wakeWord: voiceAdapters.wakeWord,
  };

  return {
    runOnce: () => runVoiceTurn(dependencies, options.io),
  };
}
