import { createDeterministicRuntime } from "../deterministic-runtime.js";
import {
  loadConfig,
  requireVoiceConfig,
  type LoadedRuntimeConfig,
  type ResolvedVoiceConfig,
} from "../config/config.js";
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

export interface VoiceRuntime {
  runOnce(): Promise<VoiceTurnResult>;
}

interface VoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

interface VoiceRuntimeFactoryOptions<TAdapterOptions> {
  adapterOptions?: TAdapterOptions;
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createAdapters(
    config: ResolvedVoiceConfig,
    options: TAdapterOptions,
  ): VoiceAdapters;
  io?: VoiceRuntimeIo;
  now?: Date;
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
    assistant: await createDeterministicRuntime({
      config,
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
    runOnce: () => runVoiceTurn(dependencies, options.io),
  };
}
