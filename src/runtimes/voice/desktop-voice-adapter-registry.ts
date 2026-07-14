import { requireDesktopVoiceCommandConfig } from "../config/desktop-voice-config.js";
import type { ParsedDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { VoiceTempFilePort } from "../../ports/voice.js";
import {
  createDesktopVoiceSlotAdapter,
  desktopVoiceSlotTopology,
  resolveDesktopVoiceSlotConfig,
} from "./desktop-voice-slot-topology.js";
import { createNodeVoiceTempFiles } from "./voice-temp-files.js";
import type {
  DesktopVoiceAdapters,
  DesktopVoiceAdapterRuntimeDependencies,
  DesktopVoiceOutputAdapters,
  DesktopVoiceServiceAdapters,
  ResolvedDesktopVoiceAdapterConfig,
  ResolvedDesktopVoiceServiceAdapterConfig,
} from "./desktop-voice-adapter-types.js";

export type {
  DesktopVoiceAdapterRuntimeDependencies,
  DesktopVoiceOutputAdapters,
  DesktopVoiceServiceAdapters,
} from "./desktop-voice-adapter-types.js";

export function resolveDesktopVoiceAdapterConfig(
  voice: ResolvedVoiceConfig,
  config: {
    desktopVoice?: ParsedDesktopVoiceConfig;
  },
): ResolvedDesktopVoiceAdapterConfig {
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
            transcription: requireStreamingSpeechToTextProvider(config),
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
            speech: requireStreamingTextToSpeechProvider(config),
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

export function createDesktopVoiceOutputAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies,
): DesktopVoiceOutputAdapters {
  const tempFiles = createNodeVoiceTempFiles();
  return createDesktopVoiceOutputAdaptersWithTempFiles(
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
  const outputAdapters = createDesktopVoiceOutputAdaptersWithTempFiles(
    voice,
    desktopVoice,
    dependencies,
    tempFiles,
  );

  return {
    ...outputAdapters,
    audioInput: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.audioInput,
      desktopVoice.audioInput,
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
          streamingInput: {
            audioInput: createDesktopVoiceSlotAdapter(
              voice,
              desktopVoiceSlotTopology.streamingAudioInput,
              desktopVoice.streamingSpeechToText.audioInput,
              context,
            ),
            speechToText:
              desktopVoice.streamingSpeechToText.transcription.create(context),
          },
        }
      : {}),
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
  };
}

function createDesktopVoiceOutputAdaptersWithTempFiles(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceAdapterConfig,
  dependencies: DesktopVoiceAdapterRuntimeDependencies,
  tempFiles: VoiceTempFilePort,
): DesktopVoiceOutputAdapters {
  const context = { dependencies, tempFiles };

  return {
    audioOutput: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.audioOutput,
      desktopVoice.audioOutput,
      context,
    ),
    ...(desktopVoice.streamingTextToSpeech
      ? {
          streamingOutput: {
            audioOutput: createDesktopVoiceSlotAdapter(
              voice,
              desktopVoiceSlotTopology.streamingAudioOutput,
              desktopVoice.streamingTextToSpeech.audioOutput,
              context,
            ),
            textToSpeech:
              desktopVoice.streamingTextToSpeech.speech.create(context),
          },
        }
      : {}),
    textToSpeech: createDesktopVoiceSlotAdapter(
      voice,
      desktopVoiceSlotTopology.textToSpeech,
      desktopVoice.textToSpeech,
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

function requireStreamingSpeechToTextProvider(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}) {
  const provider = config.desktopVoice?.streamingSpeechToTextProvider;

  if (!provider) {
    throw new Error(
      "Config voice.streamingSpeechToText must resolve a provider adapter.",
    );
  }

  return provider;
}

function requireStreamingTextToSpeechProvider(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}) {
  const provider = config.desktopVoice?.streamingTextToSpeechProvider;

  if (!provider) {
    throw new Error(
      "Config voice.streamingTextToSpeech must resolve a provider adapter.",
    );
  }

  return provider;
}
