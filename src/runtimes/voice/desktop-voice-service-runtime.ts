import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceServiceConfig } from "../config/desktop-voice-config.js";
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
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import {
  createDesktopVoiceServiceAdapters,
  type DesktopVoiceServiceAdapters,
} from "./desktop-voice-adapter-registry.js";
import {
  runVoiceActivation,
  type VoiceActivationDependencies,
  type VoiceActivationResult,
} from "./voice-activation.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";

type DesktopVoiceServiceRuntimeIo = VoiceRuntimeIo;

interface DesktopVoiceServiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createVoiceAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<typeof requireDesktopVoiceServiceConfig>,
  ) => DesktopVoiceServiceAdapters;
  io?: DesktopVoiceServiceRuntimeIo;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  runVoiceActivation?: (
    dependencies: VoiceActivationDependencies,
    io?: VoiceRuntimeIo,
  ) => Promise<VoiceActivationResult>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

export async function runDesktopVoiceServiceRuntime(
  options: DesktopVoiceServiceRuntimeOptions = {},
): Promise<ServiceRuntimeResult> {
  let loadedConfig: LoadedRuntimeConfig | undefined;

  return runServiceRuntime({
    ...forwardConfiguredServiceOptions(options),
    createAssistant: createConfiguredServiceAssistant(
      options,
      validateDesktopVoiceServiceConfig,
      (config) => {
        loadedConfig = config;
      },
    ),
    runTurn: async ({ assistant }) => {
      if (!loadedConfig) {
        throw new Error("Desktop voice service config was not loaded.");
      }

      const voiceConfig = requireVoiceConfig(loadedConfig);
      const desktopVoiceConfig = requireDesktopVoiceServiceConfig(loadedConfig);
      const adapters = (
        options.createVoiceAdapters ?? createDesktopVoiceServiceAdapters
      )(voiceConfig, desktopVoiceConfig);

      try {
        await (options.runVoiceActivation ?? runVoiceActivation)(
          {
            assistant,
            audioOutput: adapters.audioOutput,
            commandAudioInput: adapters.audioInput,
            speechToText: adapters.speechToText,
            textToSpeech: adapters.textToSpeech,
            turnConfig: {
              wakePhrases: loadedConfig.assistant.wakePhrases,
            },
            wakeAudioInput: adapters.wakeAudioInput,
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

function validateDesktopVoiceServiceConfig(config: LoadedRuntimeConfig): void {
  requireVoiceConfig(config);
  requireDesktopVoiceServiceConfig(config);
}
