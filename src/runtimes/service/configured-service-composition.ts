import type { Assistant } from "../../core/assistant/index.js";
import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
import type {
  ServiceProcessSignals,
  ServiceRuntimeIo,
  ServiceRuntimeOptions,
  ServiceShutdownContext,
  ServiceTurnFailureContext,
} from "./service-runtime.js";

export interface ConfiguredServiceCompositionOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: ServiceRuntimeIo;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

export function createConfiguredServiceAssistant(
  options: ConfiguredServiceCompositionOptions,
  validateConfig: (config: LoadedRuntimeConfig) => void,
  setLoadedConfig: (config: LoadedRuntimeConfig) => void,
): () => Promise<Assistant> {
  return async () => {
    const loadedConfig = await loadServiceConfig(options);
    validateConfig(loadedConfig);
    setLoadedConfig(loadedConfig);

    return createConfiguredTextRuntime({
      config: loadedConfig,
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  };
}

export function forwardConfiguredServiceOptions(
  options: ConfiguredServiceCompositionOptions,
): Partial<ServiceRuntimeOptions> {
  return {
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
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
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  };
}

function loadServiceConfig(
  options: ConfiguredServiceCompositionOptions,
): Promise<LoadedRuntimeConfig> {
  if (options.config) {
    return Promise.resolve(options.config);
  }

  return loadConfig(
    options.configPath ? { configPath: options.configPath } : undefined,
  );
}
