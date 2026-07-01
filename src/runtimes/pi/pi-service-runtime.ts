import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import { requireVoiceConfig } from "../config/voice-config.js";
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
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    createAssistant: async () => {
      loadedConfig = await loadPiServiceConfig(options);
      requireVoiceConfig(loadedConfig);
      requireDesktopVoiceConfig(loadedConfig);

      return createConfiguredTextRuntime({
        config: loadedConfig,
        ...(options.env ? { env: options.env } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.now ? { now: options.now() } : {}),
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
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  });
}

function loadPiServiceConfig(
  options: PiServiceRuntimeOptions,
): Promise<LoadedRuntimeConfig> {
  if (options.config) {
    return Promise.resolve(options.config);
  }

  return loadConfig(
    options.configPath ? { configPath: options.configPath } : undefined,
  );
}
