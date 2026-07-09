import { requireDesktopVoiceCommandConfig } from "../config/desktop-voice-config.js";
import type { ParsedDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { VoiceTempFilePort } from "../../ports/voice.js";
import {
  createDesktopVoiceSlotAdapter,
  desktopVoiceSlotTopology,
  resolveDesktopVoiceSlotConfig,
  resolveDesktopVoiceSlotProvider,
} from "./desktop-voice-slot-topology.js";
import { createNodeVoiceTempFiles } from "./voice-temp-files.js";
import type {
  DesktopVoiceAdapters,
  DesktopVoiceAdapterRuntimeDependencies,
  DesktopVoiceServiceAdapters,
  ResolvedDesktopVoiceAdapterConfig,
  ResolvedDesktopVoiceServiceAdapterConfig,
} from "./desktop-voice-adapter-types.js";

export type {
  DesktopVoiceAdapterRuntimeDependencies,
  DesktopVoiceServiceAdapters,
} from "./desktop-voice-adapter-types.js";

export function resolveDesktopVoiceAdapterConfig(
  voice: ResolvedVoiceConfig,
  config: {
    desktopVoice?: ParsedDesktopVoiceConfig;
  },
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
            transcription: resolveDesktopVoiceSlotProvider(
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
            speech: resolveDesktopVoiceSlotProvider(
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
  config: {
    desktopVoice?: ParsedDesktopVoiceConfig;
  },
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

  return createDesktopVoiceAdaptersWithTempFiles(
    voice,
    desktopVoice,
    dependencies,
    tempFiles,
  );
}

function createDesktopVoiceAdaptersWithTempFiles(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies,
  tempFiles: VoiceTempFilePort,
): DesktopVoiceAdapters {
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
          streamingSpeechToText:
            desktopVoice.streamingSpeechToText.transcription.create(context),
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
          streamingTextToSpeech:
            desktopVoice.streamingTextToSpeech.speech.create(context),
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
  const tempFiles = createNodeVoiceTempFiles();
  const adapters = createDesktopVoiceAdaptersWithTempFiles(
    voice,
    desktopVoice,
    dependencies,
    tempFiles,
  );
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
      await adapters.cleanup?.();
    },
  };
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
