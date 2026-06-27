import { createDeterministicRuntime } from "../deterministic-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
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

export interface VoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

export interface VoiceRuntimeFactoryOptions<TAdapterOptions> {
  adapterOptions: TAdapterOptions;
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createAdapters(
    config: LoadedRuntimeConfig,
    options: TAdapterOptions,
  ): VoiceAdapters;
  io?: VoiceRuntimeIo;
  now?: Date;
}

export async function createVoiceRuntime<TAdapterOptions>(
  options: VoiceRuntimeFactoryOptions<TAdapterOptions>,
): Promise<VoiceRuntime> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const voiceAdapters = options.createAdapters(config, options.adapterOptions);

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
