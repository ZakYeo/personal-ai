import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import { requireVoiceConfig } from "../config/voice-config.js";
import {
  createConfiguredServiceAssistant,
  forwardConfiguredServiceOptions,
} from "../service/configured-service-composition.js";
import {
  runServiceRuntime,
  type ServiceProcessSignals,
  type ServiceRuntimeResult,
  type ServiceShutdownContext,
  type ServiceTurnFailureContext,
} from "../service/service-runtime.js";
import {
  runVoiceTurn,
  type VoiceRuntimeDependencies,
  type VoiceRuntimeIo,
  type VoiceTurnResult,
} from "../voice/voice-turn.js";
import {
  createDesktopVoiceAdapters,
  type DesktopVoiceAdapters,
} from "../voice/desktop-voice-adapter-registry.js";
import { cleanupVoiceAdapters } from "../voice/voice-cleanup.js";

type PiServiceRuntimeIo = VoiceRuntimeIo;

interface PiServiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createVoiceAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<typeof requireDesktopVoiceConfig>,
  ) => DesktopVoiceAdapters;
  io?: PiServiceRuntimeIo;
  now?: () => Date;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  runVoiceTurn?: (
    dependencies: VoiceRuntimeDependencies,
    io?: VoiceRuntimeIo,
  ) => Promise<VoiceTurnResult>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

export async function runPiServiceRuntime(
  options: PiServiceRuntimeOptions = {},
): Promise<ServiceRuntimeResult> {
  let loadedConfig: LoadedRuntimeConfig | undefined;

  return runServiceRuntime({
    ...forwardConfiguredServiceOptions(options),
    createAssistant: createConfiguredServiceAssistant(
      options,
      validatePiServiceConfig,
      (config) => {
        loadedConfig = config;
      },
    ),
    runTurn: async ({ assistant }) => {
      if (!loadedConfig) {
        throw new Error("Pi service config was not loaded.");
      }

      const voiceConfig = requireVoiceConfig(loadedConfig);
      const desktopVoiceConfig = requireDesktopVoiceConfig(loadedConfig);
      const adapters = (
        options.createVoiceAdapters ?? createDesktopVoiceAdapters
      )(voiceConfig, desktopVoiceConfig);

      try {
        await (options.runVoiceTurn ?? runVoiceTurn)(
          {
            assistant,
            audioInput: adapters.audioInput,
            audioOutput: adapters.audioOutput,
            speechToText: adapters.speechToText,
            textToSpeech: adapters.textToSpeech,
            turnConfig: {
              wakePhrases: loadedConfig.assistant.wakePhrases,
            },
            wakeWord: adapters.wakeWord,
          },
          options.io,
        );
      } finally {
        await cleanupVoiceAdapters(() => adapters.cleanup?.(), options.io);
      }
    },
  });
}

function validatePiServiceConfig(config: LoadedRuntimeConfig): void {
  requireVoiceConfig(config);
  requireDesktopVoiceConfig(config);
}
