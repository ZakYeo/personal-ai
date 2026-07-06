import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import { requireVoiceConfig } from "../config/voice-config.js";
import { runConfiguredServiceRuntime } from "../service/configured-service-composition.js";
import {
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
  return runConfiguredServiceRuntime(options, {
    validateConfig: validatePiServiceConfig,
    runTurn: async ({ assistant, config }) => {
      const voiceConfig = requireVoiceConfig(config);
      const desktopVoiceConfig = requireDesktopVoiceConfig(config);
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
              wakePhrases: config.assistant.wakePhrases,
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
