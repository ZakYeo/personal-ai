import type { Assistant } from "../../core/assistant/index.js";
import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import {
  loadConfigWithSource,
  type LoadedRuntimeConfig,
} from "../config/config.js";
import {
  resolveRuntimeConfigSource,
  type RuntimeConfigSource,
} from "../config/runtime-config-source.js";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import {
  runServiceRuntime,
  type ServiceProcessSignals,
  type ServiceRuntimeIo,
  type ServiceRuntimeResult,
  type ServiceShutdownContext,
  type ServiceTurnContext,
  type ServiceTurnFailureContext,
} from "./service-runtime.js";
import type { DesktopVoiceProviderAdapterRegistry } from "../voice/desktop-voice-provider-adapter-registry.js";
import type { FeatureAdapterDependencies } from "../feature-adapter-registry.js";

interface ConfiguredServiceCompositionOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "configDirectory" | "env" | "featureAdapterRegistry" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: ServiceRuntimeIo;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
}

interface ConfiguredServiceTurnContext extends ServiceTurnContext {
  config: LoadedRuntimeConfig;
}

interface ConfiguredServiceRuntimeCallbacks {
  runTurn(context: ConfiguredServiceTurnContext): Promise<void>;
  validateConfig(
    config: LoadedRuntimeConfig,
    dependencies: FeatureAdapterDependencies,
  ): Promise<void> | void;
}

export async function runConfiguredServiceRuntime(
  options: ConfiguredServiceCompositionOptions,
  callbacks: ConfiguredServiceRuntimeCallbacks,
): Promise<ServiceRuntimeResult> {
  let startup: { assistant: Assistant; config: LoadedRuntimeConfig };

  try {
    startup = await createConfiguredServiceStartup(
      options,
      (config, dependencies) => callbacks.validateConfig(config, dependencies),
    );
  } catch (error) {
    logRuntimeFailure(error, options.io ?? {});

    return {
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    };
  }

  return runServiceRuntime({
    ...(options.configPath ? { configPath: options.configPath } : {}),
    createAssistant: () => Promise.resolve(startup.assistant),
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.processSignals
      ? { processSignals: options.processSignals }
      : {}),
    ...(options.retryAfterFailure
      ? { retryAfterFailure: options.retryAfterFailure }
      : {}),
    runTurn: (context) =>
      callbacks.runTurn({
        ...context,
        config: startup.config,
      }),
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  });
}

async function createConfiguredServiceStartup(
  options: ConfiguredServiceCompositionOptions,
  validateConfig: (
    config: LoadedRuntimeConfig,
    dependencies: FeatureAdapterDependencies,
  ) => Promise<void> | void,
): Promise<{ assistant: Assistant; config: LoadedRuntimeConfig }> {
  const configSource = await loadServiceConfig(options);
  const { config } = configSource;
  const featureAdapterDependencies: FeatureAdapterDependencies = {
    env: options.env ?? process.env,
    fetch: options.fetch ?? globalThis.fetch,
    ...(configSource.configDirectory
      ? { configDirectory: configSource.configDirectory }
      : {}),
  };
  await validateConfig(config, featureAdapterDependencies);

  const assistant = await createConfiguredTextRuntime({
    ...configSource,
    env: featureAdapterDependencies.env,
    fetch: featureAdapterDependencies.fetch,
    ...(options.now ? { now: options.now } : {}),
  });

  return { assistant, config };
}

function loadServiceConfig(
  options: ConfiguredServiceCompositionOptions,
): Promise<RuntimeConfigSource> {
  return resolveRuntimeConfigSource({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configDirectory
      ? { configDirectory: options.configDirectory }
      : {}),
    load: () =>
      loadConfigWithSource({
        ...(options.configPath ? { configPath: options.configPath } : {}),
        ...(options.desktopVoiceProviderAdapterRegistry
          ? {
              desktopVoiceProviderAdapterRegistry:
                options.desktopVoiceProviderAdapterRegistry,
            }
          : {}),
        ...(options.featureAdapterRegistry
          ? { featureAdapterRegistry: options.featureAdapterRegistry }
          : {}),
      }),
  });
}
