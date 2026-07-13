import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import {
  requireVoiceConfig,
  type ResolvedVoiceConfig,
} from "../config/voice-config.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import {
  runVoiceTurn,
  type VoiceRuntimeDependencies,
  type VoiceRuntimeIo,
  type VoiceTurnResult,
} from "./voice-turn.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import { resolveConfiguredRuntimeConfigSource } from "../config/runtime-config-source.js";

export interface VoiceRuntime {
  runOnce(): Promise<VoiceTurnResult>;
}

interface VoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  cleanup?(): Promise<void>;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

interface VoiceRuntimeFactoryOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "configDirectory" | "env" | "featureAdapterRegistry" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  resolveAdapters(
    config: LoadedRuntimeConfig,
    voiceConfig: ResolvedVoiceConfig,
  ): VoiceAdapters;
}

export async function createVoiceRuntime(
  options: VoiceRuntimeFactoryOptions,
): Promise<VoiceRuntime> {
  const configSource = await resolveConfiguredRuntimeConfigSource(options);
  const { config } = configSource;
  const voiceConfig = requireVoiceConfig(config);
  const voiceAdapters = options.resolveAdapters(config, voiceConfig);

  const dependencies: VoiceRuntimeDependencies = {
    assistant: await createConfiguredTextRuntime({
      ...configSource,
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
    }),
    audioInput: voiceAdapters.audioInput,
    audioOutput: voiceAdapters.audioOutput,
    speechToText: voiceAdapters.speechToText,
    textToSpeech: voiceAdapters.textToSpeech,
    turnConfig: {
      wakePhrases: config.assistant.wakePhrases,
    },
    wakeWord: voiceAdapters.wakeWord,
  };

  return {
    async runOnce() {
      try {
        return await runVoiceTurn(dependencies, options.io);
      } finally {
        await cleanupVoiceAdapters(() => voiceAdapters.cleanup?.(), options.io);
      }
    },
  };
}
