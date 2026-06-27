import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
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
import { logRuntimeFailure } from "../human-boundary.js";

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

interface VoiceRuntimeFactoryOptions<TAdapterOptions> extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  adapterOptions?: TAdapterOptions;
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createAdapters(
    config: ResolvedVoiceConfig,
    options: TAdapterOptions,
  ): VoiceAdapters;
  io?: VoiceRuntimeIo;
  resolveAdapterOptions?(config: LoadedRuntimeConfig): TAdapterOptions;
}

export async function createVoiceRuntime<TAdapterOptions>(
  options: VoiceRuntimeFactoryOptions<TAdapterOptions>,
): Promise<VoiceRuntime> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const voiceConfig = requireVoiceConfig(config);
  const adapterOptions = options.resolveAdapterOptions
    ? options.resolveAdapterOptions(config)
    : (options.adapterOptions as TAdapterOptions);
  const voiceAdapters = options.createAdapters(voiceConfig, adapterOptions);

  const dependencies: VoiceRuntimeDependencies = {
    assistant: await createConfiguredTextRuntime({
      config,
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
        try {
          await voiceAdapters.cleanup?.();
        } catch (error) {
          logRuntimeFailure(error, options.io ?? {});
        }
      }
    },
  };
}
