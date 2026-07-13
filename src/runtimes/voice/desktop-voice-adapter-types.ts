import type { DesktopCommandConfig } from "../../adapters/desktop/desktop-command-config.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
  TextToSpeechPort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type { ParsedDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type {
  DesktopVoiceAdapterContext,
  ResolvedDesktopVoiceProviderAdapter,
} from "./desktop-voice-provider-adapter-registry.js";
import type {
  StreamingVoiceInput,
  StreamingVoiceOutput,
} from "./streaming-voice.js";

export type {
  DesktopVoiceAdapterContext,
  DesktopVoiceAdapterRuntimeDependencies,
} from "./desktop-voice-provider-adapter-registry.js";

export interface DesktopVoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  streamingInput?: StreamingVoiceInput;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
  wakeActivation?: WakeActivationPort;
  wakeWord: WakeWordPort;
  cleanup?(): Promise<void>;
}

export interface DesktopVoiceServiceAdapters extends DesktopVoiceAdapters {
  wakeAudioInput: AudioInputPort;
}

export interface ResolvedDesktopStreamingSpeechToTextConfig {
  audioInput: DesktopCommandConfig;
  transcription: ResolvedDesktopVoiceProviderAdapter<StreamingSpeechToTextPort>;
}

export interface ResolvedDesktopStreamingTextToSpeechConfig {
  audioOutput: DesktopCommandConfig;
  speech: ResolvedDesktopVoiceProviderAdapter<StreamingTextToSpeechPort>;
}

export interface ResolvedDesktopVoiceAdapterConfig {
  audioInput: DesktopCommandConfig;
  audioOutput: DesktopCommandConfig;
  speechToText: DesktopCommandConfig;
  streamingSpeechToText?: ResolvedDesktopStreamingSpeechToTextConfig;
  streamingTextToSpeech?: ResolvedDesktopStreamingTextToSpeechConfig;
  textToSpeech: DesktopCommandConfig;
  wakeActivation?: DesktopCommandConfig;
}

export interface ResolvedDesktopVoiceServiceAdapterConfig extends ResolvedDesktopVoiceAdapterConfig {
  wakeAudioInput: DesktopCommandConfig;
}

export interface DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  create(config: TConfig, context: DesktopVoiceAdapterContext): TAdapter;
  resolveConfig(config: { desktopVoice?: ParsedDesktopVoiceConfig }): TConfig;
}

export interface DesktopVoiceSlotDescriptor<TConfig, TAdapter> {
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>;
  voiceKey: keyof ResolvedVoiceConfig;
}

export interface DesktopVoiceSlotTopology {
  audioInput: DesktopVoiceSlotDescriptor<DesktopCommandConfig, AudioInputPort>;
  audioOutput: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    AudioOutputPort
  >;
  speechToText: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    SpeechToTextPort
  >;
  streamingAudioInput: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    StreamingAudioInputPort
  >;
  streamingAudioOutput: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    StreamingAudioOutputPort
  >;
  textToSpeech: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    TextToSpeechPort
  >;
  wakeActivation: DesktopVoiceSlotDescriptor<
    DesktopCommandConfig,
    WakeActivationPort
  >;
  wakeWord: DesktopVoiceSlotDescriptor<void, WakeWordPort>;
}

export function defineDesktopVoiceAdapter<TConfig, TAdapter>(
  entry: DesktopVoiceAdapterEntry<TConfig, TAdapter>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return entry;
}
