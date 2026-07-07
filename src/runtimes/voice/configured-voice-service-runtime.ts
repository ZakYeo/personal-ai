import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { resolveDesktopVoiceServiceAdapterConfig } from "../config/desktop-voice-config.js";
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
} from "./desktop-voice-adapter-registry.js";
import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";
import {
  runVoiceActivation,
  type VoiceActivationDependencies,
  type VoiceActivationResult,
} from "./voice-activation.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { validateOpenWakeWordStartup } from "./openwakeword-startup-check.js";

export interface ConfiguredVoiceServiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createVoiceAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<
      typeof resolveDesktopVoiceServiceAdapterConfig
    >,
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
  webSocketFactory?: RealtimeSocketFactory;
}

export function runConfiguredVoiceServiceRuntime(
  options: ConfiguredVoiceServiceRuntimeOptions = {},
): Promise<ServiceRuntimeResult> {
  return runConfiguredServiceRuntime(options, {
    validateConfig: validateVoiceServiceConfig,
    runTurn: async ({ assistant, config }) => {
      const voiceConfig = requireVoiceConfig(config);
      const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
        voiceConfig,
        config,
      );
      const adapters = (
        options.createVoiceAdapters ?? createDesktopVoiceServiceAdapters
      )(voiceConfig, desktopVoiceConfig, {
        ...(options.env ? { env: options.env } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.webSocketFactory
          ? { webSocketFactory: options.webSocketFactory }
          : {}),
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

async function validateVoiceServiceConfig(
  config: LoadedRuntimeConfig,
): Promise<void> {
  const voiceConfig = requireVoiceConfig(config);
  const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
    voiceConfig,
    config,
  );

  await validateOpenWakeWordStartup(voiceConfig, desktopVoiceConfig);
}
