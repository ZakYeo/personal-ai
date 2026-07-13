import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type { ProcessControl } from "../../ports/process-control.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
  TextToSpeechPort,
  VoiceTempFilePort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type { ParsedDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";

export interface DesktopVoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  streamingAudioInput?: StreamingAudioInputPort;
  streamingAudioOutput?: StreamingAudioOutputPort;
  streamingSpeechToText?: StreamingSpeechToTextPort;
  streamingTextToSpeech?: StreamingTextToSpeechPort;
  textToSpeech: TextToSpeechPort;
  wakeActivation?: WakeActivationPort;
  wakeWord: WakeWordPort;
  cleanup?(): Promise<void>;
}

export interface DesktopVoiceServiceAdapters extends DesktopVoiceAdapters {
  wakeAudioInput: AudioInputPort;
}

export interface ResolvedDesktopVoiceProviderAdapter<TAdapter> {
  adapterId: string;
  create(context: DesktopVoiceAdapterContext): TAdapter;
}

export interface ResolvedDesktopStreamingSpeechToTextConfig {
  audioInput: VoiceCommandConfig;
  transcription: ResolvedDesktopVoiceProviderAdapter<StreamingSpeechToTextPort>;
}

export interface ResolvedDesktopStreamingTextToSpeechConfig {
  audioOutput: VoiceCommandConfig;
  speech: ResolvedDesktopVoiceProviderAdapter<StreamingTextToSpeechPort>;
}

export interface ResolvedDesktopVoiceAdapterConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  streamingSpeechToText?: ResolvedDesktopStreamingSpeechToTextConfig;
  streamingTextToSpeech?: ResolvedDesktopStreamingTextToSpeechConfig;
  textToSpeech: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
}

export interface ResolvedDesktopVoiceServiceAdapterConfig extends ResolvedDesktopVoiceAdapterConfig {
  wakeAudioInput: VoiceCommandConfig;
}

export interface DesktopVoiceAdapterRuntimeDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
  processControl: ProcessControl;
  shutdownSignal?: AbortSignal;
  webSocketFactory?: RealtimeSocketFactory;
}

export interface DesktopVoiceAdapterContext {
  dependencies: DesktopVoiceAdapterRuntimeDependencies;
  tempFiles: VoiceTempFilePort;
}

export interface DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  create(config: TConfig, context: DesktopVoiceAdapterContext): TAdapter;
  resolveConfig(config: { desktopVoice?: ParsedDesktopVoiceConfig }): TConfig;
}

interface DesktopVoiceProviderAdapterDefinition<TConfig, TAdapter> {
  create(config: TConfig, context: DesktopVoiceAdapterContext): TAdapter;
  resolveConfig(config: { desktopVoice?: ParsedDesktopVoiceConfig }): TConfig;
}

export interface DesktopVoiceProviderAdapterEntry<TAdapter> {
  resolve(config: {
    desktopVoice?: ParsedDesktopVoiceConfig;
  }): Omit<ResolvedDesktopVoiceProviderAdapter<TAdapter>, "adapterId">;
}

export interface DesktopVoiceSlotDescriptor<TConfig, TAdapter> {
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>;
  voiceKey: keyof ResolvedVoiceConfig;
}

export interface DesktopVoiceProviderSlotDescriptor<TAdapter> {
  registry: Record<string, DesktopVoiceProviderAdapterEntry<TAdapter>>;
  voiceKey: keyof ResolvedVoiceConfig;
}

export interface DesktopVoiceSlotTopology {
  audioInput: DesktopVoiceSlotDescriptor<VoiceCommandConfig, AudioInputPort>;
  audioOutput: DesktopVoiceSlotDescriptor<VoiceCommandConfig, AudioOutputPort>;
  speechToText: DesktopVoiceSlotDescriptor<
    VoiceCommandConfig,
    SpeechToTextPort
  >;
  streamingAudioInput: DesktopVoiceSlotDescriptor<
    VoiceCommandConfig,
    StreamingAudioInputPort
  >;
  streamingAudioOutput: DesktopVoiceSlotDescriptor<
    VoiceCommandConfig,
    StreamingAudioOutputPort
  >;
  streamingSpeechToText: DesktopVoiceProviderSlotDescriptor<StreamingSpeechToTextPort>;
  streamingTextToSpeech: DesktopVoiceProviderSlotDescriptor<StreamingTextToSpeechPort>;
  textToSpeech: DesktopVoiceSlotDescriptor<
    VoiceCommandConfig,
    TextToSpeechPort
  >;
  wakeActivation: DesktopVoiceSlotDescriptor<
    VoiceCommandConfig,
    WakeActivationPort
  >;
  wakeWord: DesktopVoiceSlotDescriptor<void, WakeWordPort>;
}

export function defineDesktopVoiceAdapter<TConfig, TAdapter>(
  entry: DesktopVoiceAdapterEntry<TConfig, TAdapter>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return entry;
}

export function defineDesktopVoiceProviderAdapter<TConfig, TAdapter>(
  entry: DesktopVoiceProviderAdapterDefinition<TConfig, TAdapter>,
): DesktopVoiceProviderAdapterEntry<TAdapter> {
  return {
    resolve: (config) => {
      const resolvedConfig = entry.resolveConfig(config);

      return {
        create: (context) => entry.create(resolvedConfig, context),
      };
    },
  };
}
