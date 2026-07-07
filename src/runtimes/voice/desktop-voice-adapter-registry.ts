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

interface DesktopVoiceSlotDescriptor<TConfig, TAdapter> {
  registry: Record<string, DesktopVoiceAdapterEntry<TConfig, TAdapter>>;
  voiceKey: keyof ResolvedVoiceConfig;
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
    audioInput: resolveDesktopVoiceSlotConfig(
      voice,
      desktopVoiceSlotTopology.audioInput,
      config,
    ),
    audioOutput: resolveDesktopVoiceSlotConfig(
      voice,
      desktopVoiceSlotTopology.audioOutput,
      config,
    ),
    speechToText: resolveDesktopVoiceSlotConfig(
      voice,
      desktopVoiceSlotTopology.speechToText,
      config,
    ),
    ...(voice.streamingAudioInput
      ? {
          streamingSpeechToText: {
            audioInput: resolveDesktopVoiceSlotConfig(
              voice,
              desktopVoiceSlotTopology.streamingAudioInput,
              config,
            ),
            transcription: resolveDesktopVoiceSlotConfig(
              voice,
              desktopVoiceSlotTopology.streamingSpeechToText,
              config,
            ),
          },
        }
      : {}),
    ...(voice.streamingTextToSpeech
      ? {
          streamingTextToSpeech: {
            audioOutput: resolveDesktopVoiceSlotConfig(
              voice,
              desktopVoiceSlotTopology.streamingAudioOutput,
              config,
            ),
            speech: resolveDesktopVoiceSlotConfig(
              voice,
              desktopVoiceSlotTopology.streamingTextToSpeech,
              config,
            ),
          },
        }
      : {}),
    textToSpeech: resolveDesktopVoiceSlotConfig(
      voice,
      desktopVoiceSlotTopology.textToSpeech,
      config,
    ),
    ...(voice.wakeActivation
      ? {
          wakeActivation: resolveDesktopVoiceSlotConfig(
            voice,
            desktopVoiceSlotTopology.wakeActivation,
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
    audioInput: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.audioInput,
      desktopVoice.audioInput,
      context,
    ),
    audioOutput: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.audioOutput,
      desktopVoice.audioOutput,
      context,
    ),
    speechToText: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.speechToText,
      desktopVoice.speechToText,
      context,
    ),
    ...(desktopVoice.streamingSpeechToText
      ? {
          streamingAudioInput: createDesktopVoiceSlotAdapter(
            voice,
            desktopVoiceSlotTopology.streamingAudioInput,
            desktopVoice.streamingSpeechToText.audioInput,
            context,
          ),
          streamingSpeechToText: createDesktopVoiceSlotAdapter(
            voice,
            desktopVoiceSlotTopology.streamingSpeechToText,
            desktopVoice.streamingSpeechToText.transcription,
            context,
          ),
        }
      : {}),
    ...(desktopVoice.streamingTextToSpeech
      ? {
          streamingAudioOutput: createDesktopVoiceSlotAdapter(
            voice,
            desktopVoiceSlotTopology.streamingAudioOutput,
            desktopVoice.streamingTextToSpeech.audioOutput,
            context,
          ),
          streamingTextToSpeech: createDesktopVoiceSlotAdapter(
            voice,
            desktopVoiceSlotTopology.streamingTextToSpeech,
            desktopVoice.streamingTextToSpeech.speech,
            context,
          ),
        }
      : {}),
    textToSpeech: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.textToSpeech,
      desktopVoice.textToSpeech,
      context,
    ),
    ...(desktopVoice.wakeActivation
      ? {
          wakeActivation: createDesktopVoiceSlotAdapter(
            voice,
            desktopVoiceSlotTopology.wakeActivation,
            desktopVoice.wakeActivation,
            context,
          ),
        }
      : {}),
    wakeWord: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.wakeWord,
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
    wakeAudioInput: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.audioInput,
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

const desktopVoiceSlotTopology = {
  audioInput: {
    registry: desktopVoiceAdapterRegistry.input,
    voiceKey: "input",
  },
  audioOutput: {
    registry: desktopVoiceAdapterRegistry.audioOutput,
    voiceKey: "audioOutput",
  },
  speechToText: {
    registry: desktopVoiceAdapterRegistry.speechToText,
    voiceKey: "speechToText",
  },
  streamingAudioInput: {
    registry: desktopVoiceAdapterRegistry.streamingAudioInput,
    voiceKey: "streamingAudioInput",
  },
  streamingAudioOutput: {
    registry: desktopVoiceAdapterRegistry.streamingAudioOutput,
    voiceKey: "streamingAudioOutput",
  },
  streamingSpeechToText: {
    registry: desktopVoiceAdapterRegistry.streamingSpeechToText,
    voiceKey: "streamingSpeechToText",
  },
  streamingTextToSpeech: {
    registry: desktopVoiceAdapterRegistry.streamingTextToSpeech,
    voiceKey: "streamingTextToSpeech",
  },
  textToSpeech: {
    registry: desktopVoiceAdapterRegistry.textToSpeech,
    voiceKey: "textToSpeech",
  },
  wakeActivation: {
    registry: desktopVoiceAdapterRegistry.wakeActivation,
    voiceKey: "wakeActivation",
  },
  wakeWord: {
    registry: desktopVoiceAdapterRegistry.wakeWord,
    voiceKey: "wakeWord",
  },
} satisfies Record<string, DesktopVoiceSlotDescriptor<unknown, unknown>>;

function resolveDesktopVoiceSlotConfig<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
): TConfig {
  return selectConfiguredDesktopVoiceAdapter(voice, descriptor).resolveConfig(
    config,
  );
}

function createDesktopVoiceSlotAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
  config: TConfig,
  context: DesktopVoiceAdapterContext,
): TAdapter {
  return selectConfiguredDesktopVoiceAdapter(voice, descriptor).create(
    config,
    context,
  );
}

function selectConfiguredDesktopVoiceAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return selectConfiguredRuntimeEntry({
    configuredId: voice[descriptor.voiceKey],
    missingMessage: `Config voice.${descriptor.voiceKey} must be configured.`,
    registry: descriptor.registry,
    unknownMessage: (configuredId) =>
      `Config voice.${descriptor.voiceKey} "${configuredId}" is not registered.`,
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
