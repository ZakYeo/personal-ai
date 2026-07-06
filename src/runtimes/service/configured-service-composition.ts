import type { Assistant } from "../../core/assistant/index.js";
import {
  createConfiguredTextRuntime,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { loadConfig, type LoadedRuntimeConfig } from "../config/config.js";
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

interface ConfiguredServiceCompositionOptions extends Pick<
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

interface ConfiguredServiceTurnContext extends ServiceTurnContext {
  config: LoadedRuntimeConfig;
}

interface ConfiguredServiceRuntimeCallbacks {
  runTurn(context: ConfiguredServiceTurnContext): Promise<void>;
  validateConfig(config: LoadedRuntimeConfig): void;
}

export async function runConfiguredServiceRuntime(
  options: ConfiguredServiceCompositionOptions,
  callbacks: ConfiguredServiceRuntimeCallbacks,
): Promise<ServiceRuntimeResult> {
  let startup: { assistant: Assistant; config: LoadedRuntimeConfig };

  try {
    startup = await createConfiguredServiceStartup(options, (config) => {
      callbacks.validateConfig(config);
    });
  } catch (error) {
    logRuntimeFailure(error, options.io ?? {});

    return {
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    };
  }

  return runServiceRuntime({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    createAssistant: () => Promise.resolve(startup.assistant),
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
  validateConfig: (config: LoadedRuntimeConfig) => void,
): Promise<{ assistant: Assistant; config: LoadedRuntimeConfig }> {
  const config = await loadServiceConfig(options);
  validateConfig(config);

  const assistant = await createConfiguredTextRuntime({
    config,
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
  });

  return { assistant, config };
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
