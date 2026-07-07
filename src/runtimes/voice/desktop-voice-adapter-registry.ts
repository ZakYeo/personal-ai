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
  ResolvedDesktopVoiceConfig,
  ResolvedDesktopVoiceServiceConfig,
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig
} from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";
import { createNodeVoiceTempFiles } from "./voice-temp-files.js";

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

export function createDesktopVoiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceConfig,
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
    ...(voice.streamingAudioInput
      ? {
          streamingAudioInput: selectConfiguredVoiceAdapter(
            voice,
            "streamingAudioInput",
            desktopVoiceAdapterRegistry.streamingAudioInput,
          )(requireDesktopStreamingAudioInputConfig(desktopVoice)),
        }
      : {}),
    ...(voice.streamingAudioOutput
      ? {
          streamingAudioOutput: selectConfiguredVoiceAdapter(
            voice,
            "streamingAudioOutput",
            desktopVoiceAdapterRegistry.streamingAudioOutput,
          )(requireDesktopStreamingAudioOutputConfig(desktopVoice)),
        }
      : {}),
    ...(voice.streamingSpeechToText
      ? {
          streamingSpeechToText: selectConfiguredVoiceAdapter(
            voice,
            "streamingSpeechToText",
            desktopVoiceAdapterRegistry.streamingSpeechToText,
          )(
            requireDesktopRealtimeTranscriptionConfig(desktopVoice),
            env,
            dependencies.webSocketFactory ?? createDefaultWebSocketFactory,
          ),
        }
      : {}),
    ...(voice.streamingTextToSpeech
      ? {
          streamingTextToSpeech: selectConfiguredVoiceAdapter(
            voice,
            "streamingTextToSpeech",
            desktopVoiceAdapterRegistry.streamingTextToSpeech,
          )(requireDesktopStreamingSpeechConfig(desktopVoice), env, fetch),
        }
      : {}),
    textToSpeech: selectConfiguredVoiceAdapter(
      voice,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
    )(desktopVoice.textToSpeech, tempFiles),
    ...(voice.wakeActivation
      ? {
          wakeActivation: selectConfiguredVoiceAdapter(
            voice,
            "wakeActivation",
            desktopVoiceAdapterRegistry.wakeActivation,
          )(requireDesktopWakeActivationConfig(desktopVoice)),
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
  desktopVoice: ResolvedDesktopVoiceServiceConfig,
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

function requireDesktopWakeActivationConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  if (!desktopVoice.wakeActivation) {
    throw new Error("Config desktopVoice.wakeActivation must be configured.");
  }

  return desktopVoice.wakeActivation;
}

function requireDesktopStreamingAudioInputConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  if (!desktopVoice.streamingAudioInput) {
    throw new Error(
      "Config desktopVoice.streamingAudioInput must be configured.",
    );
  }

  return desktopVoice.streamingAudioInput;
}

function requireDesktopStreamingAudioOutputConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  if (!desktopVoice.streamingAudioOutput) {
    throw new Error(
      "Config desktopVoice.streamingAudioOutput must be configured.",
    );
  }

  return desktopVoice.streamingAudioOutput;
}

function requireDesktopRealtimeTranscriptionConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): OpenAIRealtimeTranscriptionConfig {
  if (!desktopVoice.openAIRealtimeTranscription) {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription must be configured.",
    );
  }

  return desktopVoice.openAIRealtimeTranscription;
}

function requireDesktopStreamingSpeechConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): OpenAIStreamingSpeechConfig {
  if (!desktopVoice.openAIStreamingSpeech) {
    throw new Error(
      "Config desktopVoice.openAIStreamingSpeech must be configured.",
    );
  }

  return desktopVoice.openAIStreamingSpeech;
}

function createDefaultWebSocketFactory({
  apiKey,
  url,
}: {
  apiKey: string;
  url: string;
}): ReturnType<RealtimeSocketFactory> {
  const WebSocketConstructor = (
    globalThis as {
      WebSocket?: new (
        url: string,
        protocols?: string[],
        options?: { headers?: Record<string, string> },
      ) => ReturnType<RealtimeSocketFactory>;
    }
  ).WebSocket;

  if (!WebSocketConstructor) {
    throw new Error("Runtime WebSocket support is not available.");
  }

  return new WebSocketConstructor(url, [], {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}
