import {
  CommandSpeechToText,
  CommandTextToSpeech,
  CommandWakeActivation,
  SoxAudioInput,
  SoxAudioOutput,
  TextPrefixWakeWordDetector,
} from "../../adapters/desktop/desktop-voice-adapters.js";
import {
  CommandStreamingAudioInput,
  CommandStreamingAudioOutput,
} from "../../adapters/desktop/desktop-streaming-voice-adapters.js";
import {
  OpenAIRealtimeTranscription,
  type RealtimeSocketFactory,
} from "../../adapters/openai/openai-realtime-transcription.js";
import { createOpenAIRealtimeWebSocketFactory } from "../../adapters/openai/openai-realtime-websocket.js";
import { OpenAIStreamingSpeech } from "../../adapters/openai/openai-streaming-speech.js";
import type { VoiceCommandConfig } from "../../ports/assistant.js";
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
import type {
  ResolvedDesktopVoiceAdapterConfig,
  ResolvedDesktopVoiceServiceAdapterConfig,
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig,
} from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";
import { createNodeVoiceTempFiles } from "./voice-temp-files.js";

interface DesktopVoiceAdapters {
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

export function createDesktopVoiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies = {},
): DesktopVoiceAdapters {
  const tempFiles = createNodeVoiceTempFiles();
  const env = dependencies.env ?? process.env;
  const fetch = dependencies.fetch ?? globalThis.fetch;

  return {
    audioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(desktopVoice.audioInput, tempFiles),
    audioOutput: selectConfiguredVoiceAdapter(
      voice,
      "audioOutput",
      desktopVoiceAdapterRegistry.audioOutput,
    )(desktopVoice.audioOutput),
    speechToText: selectConfiguredVoiceAdapter(
      voice,
      "speechToText",
      desktopVoiceAdapterRegistry.speechToText,
    )(desktopVoice.speechToText),
    ...(desktopVoice.streamingSpeechToText
      ? {
          streamingAudioInput: selectConfiguredVoiceAdapter(
            voice,
            "streamingAudioInput",
            desktopVoiceAdapterRegistry.streamingAudioInput,
          )(desktopVoice.streamingSpeechToText.audioInput),
          streamingSpeechToText: selectConfiguredVoiceAdapter(
            voice,
            "streamingSpeechToText",
            desktopVoiceAdapterRegistry.streamingSpeechToText,
          )(
            desktopVoice.streamingSpeechToText.transcription,
            env,
            dependencies.webSocketFactory ??
              createOpenAIRealtimeWebSocketFactory,
          ),
        }
      : {}),
    ...(desktopVoice.streamingTextToSpeech
      ? {
          streamingAudioOutput: selectConfiguredVoiceAdapter(
            voice,
            "streamingAudioOutput",
            desktopVoiceAdapterRegistry.streamingAudioOutput,
          )(desktopVoice.streamingTextToSpeech.audioOutput),
          streamingTextToSpeech: selectConfiguredVoiceAdapter(
            voice,
            "streamingTextToSpeech",
            desktopVoiceAdapterRegistry.streamingTextToSpeech,
          )(desktopVoice.streamingTextToSpeech.speech, env, fetch),
        }
      : {}),
    textToSpeech: selectConfiguredVoiceAdapter(
      voice,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
    )(desktopVoice.textToSpeech, tempFiles),
    ...(desktopVoice.wakeActivation
      ? {
          wakeActivation: selectConfiguredVoiceAdapter(
            voice,
            "wakeActivation",
            desktopVoiceAdapterRegistry.wakeActivation,
          )(desktopVoice.wakeActivation),
        }
      : {}),
    wakeWord: selectConfiguredVoiceAdapter(
      voice,
      "wakeWord",
      desktopVoiceAdapterRegistry.wakeWord,
    )(),
    cleanup: () => tempFiles.cleanup(),
  };
}

export function createDesktopVoiceServiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceServiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies = {},
): DesktopVoiceServiceAdapters {
  const adapters = createDesktopVoiceAdapters(
    voice,
    desktopVoice,
    dependencies,
  );
  const tempFiles = createNodeVoiceTempFiles();

  return {
    ...adapters,
    wakeAudioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(desktopVoice.wakeAudioInput, tempFiles),
    cleanup: async () => {
      await Promise.all([adapters.cleanup?.(), tempFiles.cleanup()]);
    },
  };
}

const desktopVoiceAdapterRegistry = {
  input: {
    "sox-rec": (command: VoiceCommandConfig, tempFiles: VoiceTempFilePort) =>
      new SoxAudioInput(command, tempFiles),
  },
  wakeWord: {
    "text-prefix": () => new TextPrefixWakeWordDetector(),
  },
  wakeActivation: {
    "openwakeword-command": (command: VoiceCommandConfig) =>
      new CommandWakeActivation(command),
  },
  streamingAudioInput: {
    "sox-rec-stream": (command: VoiceCommandConfig) =>
      new CommandStreamingAudioInput(command),
  },
  streamingAudioOutput: {
    "sox-play-stream": (command: VoiceCommandConfig) =>
      new CommandStreamingAudioOutput(command),
  },
  streamingSpeechToText: {
    "openai-realtime": (
      config: OpenAIRealtimeTranscriptionConfig,
      env: Record<string, string | undefined>,
      webSocketFactory: RealtimeSocketFactory,
    ) =>
      new OpenAIRealtimeTranscription({
        config,
        env,
        webSocketFactory,
      }),
  },
  streamingTextToSpeech: {
    "openai-streaming": (
      config: OpenAIStreamingSpeechConfig,
      env: Record<string, string | undefined>,
      fetch: typeof globalThis.fetch,
    ) =>
      new OpenAIStreamingSpeech({
        config,
        env,
        fetch,
      }),
  },
  speechToText: {
    command: (command: VoiceCommandConfig) => new CommandSpeechToText(command),
  },
  textToSpeech: {
    command: (command: VoiceCommandConfig, tempFiles: VoiceTempFilePort) =>
      new CommandTextToSpeech(command, tempFiles),
  },
  audioOutput: {
    "sox-play": (command: VoiceCommandConfig) => new SoxAudioOutput(command),
  },
} satisfies {
  input: Record<
    string,
    (
      command: VoiceCommandConfig,
      tempFiles: VoiceTempFilePort,
    ) => AudioInputPort
  >;
  wakeWord: Record<string, () => WakeWordPort>;
  wakeActivation: Record<
    string,
    (command: VoiceCommandConfig) => WakeActivationPort
  >;
  streamingAudioInput: Record<
    string,
    (command: VoiceCommandConfig) => StreamingAudioInputPort
  >;
  streamingAudioOutput: Record<
    string,
    (command: VoiceCommandConfig) => StreamingAudioOutputPort
  >;
  streamingSpeechToText: Record<
    string,
    (
      config: OpenAIRealtimeTranscriptionConfig,
      env: Record<string, string | undefined>,
      webSocketFactory: RealtimeSocketFactory,
    ) => StreamingSpeechToTextPort
  >;
  streamingTextToSpeech: Record<
    string,
    (
      config: OpenAIStreamingSpeechConfig,
      env: Record<string, string | undefined>,
      fetch: typeof globalThis.fetch,
    ) => StreamingTextToSpeechPort
  >;
  speechToText: Record<
    string,
    (command: VoiceCommandConfig) => SpeechToTextPort
  >;
  textToSpeech: Record<
    string,
    (
      command: VoiceCommandConfig,
      tempFiles: VoiceTempFilePort,
    ) => TextToSpeechPort
  >;
  audioOutput: Record<string, (command: VoiceCommandConfig) => AudioOutputPort>;
};

export interface DesktopVoiceAdapterRuntimeDependencies {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  webSocketFactory?: RealtimeSocketFactory;
}
