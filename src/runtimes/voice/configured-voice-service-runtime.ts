import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { createNodeProcessControl } from "../process-control.js";
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
  resolveDesktopVoiceServiceAdapterConfig,
  type DesktopVoiceAdapterRuntimeDependencies,
  type DesktopVoiceServiceAdapters,
} from "./desktop-voice-adapter-registry.js";
import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";
import type { ProcessControl } from "../../ports/process-control.js";
import { validateConfiguredFeatureAdapters } from "../feature-adapter-selection.js";
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
  processControl?: ProcessControl;
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
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const processControl =
    options.processControl ?? createNodeProcessControl(process);

  return runConfiguredServiceRuntime(options, {
    validateConfig: (config) => validateVoiceServiceConfig(config, env, fetch),
    runTurn: async ({ assistant, config, shutdownSignal }) => {
      const voiceConfig = requireVoiceConfig(config);
      const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
        voiceConfig,
        config,
      );
      const adapters = (
        options.createVoiceAdapters ?? createDesktopVoiceServiceAdapters
      )(voiceConfig, desktopVoiceConfig, {
        env,
        fetch,
        processControl,
        shutdownSignal,
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
  env: Record<string, string | undefined>,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const voiceConfig = requireVoiceConfig(config);
  const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
    voiceConfig,
    config,
  );

  await validateOpenWakeWordStartup(voiceConfig, desktopVoiceConfig);
  validateConfiguredFeatureAdapters(config, {
    env,
    fetch,
  });
}
