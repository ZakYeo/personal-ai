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
import type {
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig,
  ParsedDesktopVoiceConfig,
  ResolvedDesktopVoiceAdapterConfig,
  ResolvedDesktopVoiceServiceAdapterConfig,
} from "../config/desktop-voice-config.js";
import {
  requireDesktopOpenAIRealtimeTranscriptionConfig,
  requireDesktopOpenAIStreamingSpeechConfig,
  requireDesktopVoiceCommandConfig,
} from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
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

interface DesktopVoiceAdapterContext {
  dependencies: DesktopVoiceAdapterRuntimeDependencies;
  tempFiles: VoiceTempFilePort;
}

interface DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  create(config: TConfig, context: DesktopVoiceAdapterContext): TAdapter;
  resolveConfig(config: { desktopVoice?: ParsedDesktopVoiceConfig }): TConfig;
}

export interface DesktopVoiceAdapterRuntimeDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
  processControl: ProcessControl;
  webSocketFactory?: RealtimeSocketFactory;
}

export function resolveDesktopVoiceAdapterConfig(
  voice: ResolvedVoiceConfig,
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
): ResolvedDesktopVoiceAdapterConfig {
  requireStreamingPair(
    voice.streamingAudioInput,
    voice.streamingSpeechToText,
    "streamingAudioInput",
    "streamingSpeechToText",
  );
  requireStreamingPair(
    voice.streamingTextToSpeech,
    voice.streamingAudioOutput,
    "streamingTextToSpeech",
    "streamingAudioOutput",
  );

  return {
    audioInput: resolveSelectedDesktopVoiceAdapterConfig(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
      config,
    ),
    audioOutput: resolveSelectedDesktopVoiceAdapterConfig(
      voice,
      "audioOutput",
      desktopVoiceAdapterRegistry.audioOutput,
      config,
    ),
    speechToText: resolveSelectedDesktopVoiceAdapterConfig(
      voice,
      "speechToText",
      desktopVoiceAdapterRegistry.speechToText,
      config,
    ),
    ...(voice.streamingAudioInput
      ? {
          streamingSpeechToText: {
            audioInput: resolveSelectedDesktopVoiceAdapterConfig(
              voice,
              "streamingAudioInput",
              desktopVoiceAdapterRegistry.streamingAudioInput,
              config,
            ),
            transcription: resolveSelectedDesktopVoiceAdapterConfig(
              voice,
              "streamingSpeechToText",
              desktopVoiceAdapterRegistry.streamingSpeechToText,
              config,
            ),
          },
        }
      : {}),
    ...(voice.streamingTextToSpeech
      ? {
          streamingTextToSpeech: {
            audioOutput: resolveSelectedDesktopVoiceAdapterConfig(
              voice,
              "streamingAudioOutput",
              desktopVoiceAdapterRegistry.streamingAudioOutput,
              config,
            ),
            speech: resolveSelectedDesktopVoiceAdapterConfig(
              voice,
              "streamingTextToSpeech",
              desktopVoiceAdapterRegistry.streamingTextToSpeech,
              config,
            ),
          },
        }
      : {}),
    textToSpeech: resolveSelectedDesktopVoiceAdapterConfig(
      voice,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
      config,
    ),
    ...(voice.wakeActivation
      ? {
          wakeActivation: resolveSelectedDesktopVoiceAdapterConfig(
            voice,
            "wakeActivation",
            desktopVoiceAdapterRegistry.wakeActivation,
            config,
          ),
        }
      : {}),
  };
}

export function resolveDesktopVoiceServiceAdapterConfig(
  voice: ResolvedVoiceConfig,
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
): ResolvedDesktopVoiceServiceAdapterConfig {
  return {
    ...resolveDesktopVoiceAdapterConfig(voice, config),
    wakeAudioInput: requireDesktopVoiceCommandConfig(config, "wakeAudioInput"),
  };
}

export function createDesktopVoiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies,
): DesktopVoiceAdapters {
  const tempFiles = createNodeVoiceTempFiles();
  const context = { dependencies, tempFiles };

  return {
    audioInput: createSelectedDesktopVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
      desktopVoice.audioInput,
      context,
    ),
    audioOutput: createSelectedDesktopVoiceAdapter(
      voice,
      "audioOutput",
      desktopVoiceAdapterRegistry.audioOutput,
      desktopVoice.audioOutput,
      context,
    ),
    speechToText: createSelectedDesktopVoiceAdapter(
      voice,
      "speechToText",
      desktopVoiceAdapterRegistry.speechToText,
      desktopVoice.speechToText,
      context,
    ),
    ...(desktopVoice.streamingSpeechToText
      ? {
          streamingAudioInput: createSelectedDesktopVoiceAdapter(
            voice,
            "streamingAudioInput",
            desktopVoiceAdapterRegistry.streamingAudioInput,
            desktopVoice.streamingSpeechToText.audioInput,
            context,
          ),
          streamingSpeechToText: createSelectedDesktopVoiceAdapter(
            voice,
            "streamingSpeechToText",
            desktopVoiceAdapterRegistry.streamingSpeechToText,
            desktopVoice.streamingSpeechToText.transcription,
            context,
          ),
        }
      : {}),
    ...(desktopVoice.streamingTextToSpeech
      ? {
          streamingAudioOutput: createSelectedDesktopVoiceAdapter(
            voice,
            "streamingAudioOutput",
            desktopVoiceAdapterRegistry.streamingAudioOutput,
            desktopVoice.streamingTextToSpeech.audioOutput,
            context,
          ),
          streamingTextToSpeech: createSelectedDesktopVoiceAdapter(
            voice,
            "streamingTextToSpeech",
            desktopVoiceAdapterRegistry.streamingTextToSpeech,
            desktopVoice.streamingTextToSpeech.speech,
            context,
          ),
        }
      : {}),
    textToSpeech: createSelectedDesktopVoiceAdapter(
      voice,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
      desktopVoice.textToSpeech,
      context,
    ),
    ...(desktopVoice.wakeActivation
      ? {
          wakeActivation: createSelectedDesktopVoiceAdapter(
            voice,
            "wakeActivation",
            desktopVoiceAdapterRegistry.wakeActivation,
            desktopVoice.wakeActivation,
            context,
          ),
        }
      : {}),
    wakeWord: createSelectedDesktopVoiceAdapter(
      voice,
      "wakeWord",
      desktopVoiceAdapterRegistry.wakeWord,
      undefined,
      context,
    ),
    cleanup: () => tempFiles.cleanup(),
  };
}

export function createDesktopVoiceServiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceServiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies,
): DesktopVoiceServiceAdapters {
  const adapters = createDesktopVoiceAdapters(
    voice,
    desktopVoice,
    dependencies,
  );
  const tempFiles = createNodeVoiceTempFiles();
  const context = { dependencies, tempFiles };

  return {
    ...adapters,
    wakeAudioInput: createSelectedDesktopVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
      desktopVoice.wakeAudioInput,
      context,
    ),
    cleanup: async () => {
      await Promise.all([adapters.cleanup?.(), tempFiles.cleanup()]);
    },
  };
}

function defineDesktopVoiceAdapter<TConfig, TAdapter>(
  entry: DesktopVoiceAdapterEntry<TConfig, TAdapter>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return entry;
}

const desktopVoiceAdapterRegistry = {
  input: {
    "sox-rec": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new SoxAudioInput(
          command,
          context.tempFiles,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "audioInput"),
    }),
  },
  wakeWord: {
    "text-prefix": defineDesktopVoiceAdapter({
      create: () => new TextPrefixWakeWordDetector(),
      resolveConfig: () => {},
    }),
  },
  wakeActivation: {
    "openwakeword-command": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandWakeActivation(command, context.dependencies.processControl),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "wakeActivation"),
    }),
  },
  streamingAudioInput: {
    "sox-rec-stream": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandStreamingAudioInput(
          command,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "streamingAudioInput"),
    }),
  },
  streamingAudioOutput: {
    "sox-play-stream": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandStreamingAudioOutput(
          command,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "streamingAudioOutput"),
    }),
  },
  streamingSpeechToText: {
    "openai-realtime": defineDesktopVoiceAdapter({
      create: (config: OpenAIRealtimeTranscriptionConfig, { dependencies }) =>
        new OpenAIRealtimeTranscription({
          config,
          env: dependencies.env,
          webSocketFactory:
            dependencies.webSocketFactory ??
            createOpenAIRealtimeWebSocketFactory,
        }),
      resolveConfig: requireDesktopOpenAIRealtimeTranscriptionConfig,
    }),
  },
  streamingTextToSpeech: {
    "openai-streaming": defineDesktopVoiceAdapter({
      create: (config: OpenAIStreamingSpeechConfig, { dependencies }) =>
        new OpenAIStreamingSpeech({
          config,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
      resolveConfig: requireDesktopOpenAIStreamingSpeechConfig,
    }),
  },
  speechToText: {
    command: defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandSpeechToText(command, context.dependencies.processControl),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "speechToText"),
    }),
  },
  textToSpeech: {
    command: defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandTextToSpeech(
          command,
          context.tempFiles,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "textToSpeech"),
    }),
  },
  audioOutput: {
    "sox-play": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new SoxAudioOutput(command, context.dependencies.processControl),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "audioOutput"),
    }),
  },
} satisfies {
  input: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, AudioInputPort>
  >;
  wakeWord: Record<string, DesktopVoiceAdapterEntry<void, WakeWordPort>>;
  wakeActivation: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, WakeActivationPort>
  >;
  streamingAudioInput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, StreamingAudioInputPort>
  >;
  streamingAudioOutput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, StreamingAudioOutputPort>
  >;
  streamingSpeechToText: Record<
    string,
    DesktopVoiceAdapterEntry<
      OpenAIRealtimeTranscriptionConfig,
      StreamingSpeechToTextPort
    >
  >;
  streamingTextToSpeech: Record<
    string,
    DesktopVoiceAdapterEntry<
      OpenAIStreamingSpeechConfig,
      StreamingTextToSpeechPort
    >
  >;
  speechToText: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, SpeechToTextPort>
  >;
  textToSpeech: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, TextToSpeechPort>
  >;
  audioOutput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, AudioOutputPort>
  >;
};

function resolveSelectedDesktopVoiceAdapterConfig<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  key: keyof ResolvedVoiceConfig,
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>,
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
): TConfig {
  return selectConfiguredDesktopVoiceAdapter(
    voice,
    key,
    registry,
  ).resolveConfig(config);
}

function createSelectedDesktopVoiceAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  key: keyof ResolvedVoiceConfig,
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>,
  config: TConfig,
  context: DesktopVoiceAdapterContext,
): TAdapter {
  return selectConfiguredDesktopVoiceAdapter(voice, key, registry).create(
    config,
    context,
  );
}

function selectConfiguredDesktopVoiceAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  key: keyof ResolvedVoiceConfig,
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return selectConfiguredRuntimeEntry({
    configuredId: voice[key],
    missingMessage: `Config voice.${key} must be configured.`,
    registry,
    unknownMessage: (configuredId) =>
      `Config voice.${key} "${configuredId}" is not registered.`,
  });
}

function requireStreamingPair(
  firstAdapterId: string | undefined,
  secondAdapterId: string | undefined,
  firstKey: string,
  secondKey: string,
): void {
  if (Boolean(firstAdapterId) === Boolean(secondAdapterId)) {
    return;
  }

  throw new Error(
    `Config voice.${firstKey} and voice.${secondKey} must be configured together.`,
  );
}
