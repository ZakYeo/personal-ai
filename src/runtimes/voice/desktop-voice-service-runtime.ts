import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceServiceConfig } from "../config/desktop-voice-config.js";
import { requireVoiceConfig } from "../config/voice-config.js";
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
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    createAssistant: async () => {
      loadedConfig = await loadDesktopVoiceServiceConfig(options);
      requireVoiceConfig(loadedConfig);
      requireDesktopVoiceServiceConfig(loadedConfig);

      return createConfiguredTextRuntime({
        config: loadedConfig,
        ...(options.env ? { env: options.env } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
    },
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.processSignals
      ? { processSignals: options.processSignals }
      : {}),
    ...(options.retryAfterFailure
      ? { retryAfterFailure: options.retryAfterFailure }
      : {}),
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
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  });
}

function loadDesktopVoiceServiceConfig(
  options: DesktopVoiceServiceRuntimeOptions,
): Promise<LoadedRuntimeConfig> {
  if (options.config) {
    return Promise.resolve(options.config);
  }

  return loadConfig(
    options.configPath ? { configPath: options.configPath } : undefined,
  );
}
