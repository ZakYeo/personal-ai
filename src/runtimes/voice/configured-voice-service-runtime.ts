import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceServiceConfig } from "../config/desktop-voice-config.js";
import { requireVoiceConfig } from "../config/voice-config.js";
import { runConfiguredServiceRuntime } from "../service/configured-service-composition.js";
import type {
  ServiceProcessSignals,
  ServiceRuntimeResult,
  ServiceShutdownContext,
  ServiceTurnFailureContext,
} from "../service/service-runtime.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import {
  createDesktopVoiceServiceAdapters,
  type DesktopVoiceAdapterRuntimeDependencies,
  type DesktopVoiceServiceAdapters,
  validateDesktopVoiceAdapterConfig,
} from "./desktop-voice-adapter-registry.js";
import {
  runVoiceActivation,
  type VoiceActivationDependencies,
  type VoiceActivationResult,
} from "./voice-activation.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";

export interface ConfiguredVoiceServiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createVoiceAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<typeof requireDesktopVoiceServiceConfig>,
    dependencies: DesktopVoiceAdapterRuntimeDependencies,
  ) => DesktopVoiceServiceAdapters;
  io?: VoiceRuntimeIo;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  runVoiceActivation?: (
    dependencies: VoiceActivationDependencies,
    io?: VoiceRuntimeIo,
  ) => Promise<VoiceActivationResult>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

export function runConfiguredVoiceServiceRuntime(
  options: ConfiguredVoiceServiceRuntimeOptions = {},
): Promise<ServiceRuntimeResult> {
  return runConfiguredServiceRuntime(options, {
    validateConfig: validateVoiceServiceConfig,
    runTurn: async ({ assistant, config }) => {
      const voiceConfig = requireVoiceConfig(config);
      const desktopVoiceConfig = requireDesktopVoiceServiceConfig(config);
      const adapters = (
        options.createVoiceAdapters ?? createDesktopVoiceServiceAdapters
      )(voiceConfig, desktopVoiceConfig, {
        ...(options.env ? { env: options.env } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      try {
        await (options.runVoiceActivation ?? runVoiceActivation)(
          {
            assistant,
            audioOutput: adapters.audioOutput,
            commandAudioInput: adapters.audioInput,
            speechToText: adapters.speechToText,
            ...(adapters.streamingAudioInput
              ? { streamingAudioInput: adapters.streamingAudioInput }
              : {}),
            ...(adapters.streamingAudioOutput
              ? { streamingAudioOutput: adapters.streamingAudioOutput }
              : {}),
            ...(adapters.streamingSpeechToText
              ? { streamingSpeechToText: adapters.streamingSpeechToText }
              : {}),
            ...(adapters.streamingTextToSpeech
              ? { streamingTextToSpeech: adapters.streamingTextToSpeech }
              : {}),
            textToSpeech: adapters.textToSpeech,
            turnConfig: {
              wakePhrases: config.assistant.wakePhrases,
            },
            ...(adapters.wakeActivation
              ? { wakeActivation: adapters.wakeActivation }
              : {}),
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

function validateVoiceServiceConfig(config: LoadedRuntimeConfig): void {
  const voiceConfig = requireVoiceConfig(config);
  const desktopVoiceConfig = requireDesktopVoiceServiceConfig(config);

  validateDesktopVoiceAdapterConfig(voiceConfig, desktopVoiceConfig);
}
