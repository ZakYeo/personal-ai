import type { Assistant } from "../../core/assistant/index.js";
import {
  createConfiguredTextRuntimeComposition,
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
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";

interface ConfiguredServiceCompositionOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "configDirectory" | "env" | "featureAdapterRegistry" | "fetch" | "now"
> {
  createNotificationDelivery?: (context: {
    config: LoadedRuntimeConfig;
  }) => NotificationDeliveryPort;
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: ServiceRuntimeIo;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  runBackgroundTask?: (
    task: RuntimeBackgroundTask,
    context: RuntimeBackgroundTaskContext,
  ) => Promise<void>;
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
  let startup: {
    assistant: Assistant;
    backgroundTasks: RuntimeBackgroundTask[];
    config: LoadedRuntimeConfig;
  };

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

  let backgroundTaskGroup: Promise<void> | undefined;
  let backgroundTaskFailed = false;
  const result = await runServiceRuntime({
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
    runTurn: (context) => {
      if (!backgroundTaskGroup && startup.backgroundTasks.length > 0) {
        backgroundTaskGroup = Promise.all(
          startup.backgroundTasks.map(async (task) => {
            try {
              await (options.runBackgroundTask ?? runBackgroundTask)(task, {
                clock: { now: options.now ?? (() => new Date()) },
                reportFailure: (error) => {
                  logRuntimeFailure(error, options.io ?? {});
                },
                shutdownSignal: context.shutdownSignal,
              });
            } catch (error) {
              backgroundTaskFailed = true;
              logRuntimeFailureBestEffort(error, options.io ?? {});
              context.requestShutdown(task.failureReason);
            }
          }),
        ).then(() => {});
      }

      return callbacks.runTurn({
        ...context,
        config: startup.config,
      });
    },
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  });

  await backgroundTaskGroup;
  if (backgroundTaskFailed) {
    return {
      response: safeRuntimeFallbackResponse,
      status: "failed",
      turnsCompleted: result.turnsCompleted,
    };
  }

  return result;
}

async function createConfiguredServiceStartup(
  options: ConfiguredServiceCompositionOptions,
  validateConfig: (
    config: LoadedRuntimeConfig,
    dependencies: FeatureAdapterDependencies,
  ) => Promise<void> | void,
): Promise<{
  assistant: Assistant;
  backgroundTasks: RuntimeBackgroundTask[];
  config: LoadedRuntimeConfig;
}> {
  const configSource = await loadServiceConfig(options);
  const { config } = configSource;
  const notificationDelivery = options.createNotificationDelivery?.({ config });
  const featureAdapterDependencies: FeatureAdapterDependencies = {
    clock: { now: options.now ?? (() => new Date()) },
    env: options.env ?? process.env,
    fetch: options.fetch ?? globalThis.fetch,
    ...(notificationDelivery ? { notificationDelivery } : {}),
    ...(configSource.configDirectory
      ? { configDirectory: configSource.configDirectory }
      : {}),
  };
  await validateConfig(config, featureAdapterDependencies);

  const composition = await createConfiguredTextRuntimeComposition({
    ...configSource,
    env: featureAdapterDependencies.env,
    fetch: featureAdapterDependencies.fetch,
    ...(notificationDelivery ? { notificationDelivery } : {}),
    ...(options.now ? { now: options.now } : {}),
  });

  return { ...composition, config };
}

function runBackgroundTask(
  task: RuntimeBackgroundTask,
  context: RuntimeBackgroundTaskContext,
): Promise<void> {
  return task.run(context);
}

function logRuntimeFailureBestEffort(
  error: unknown,
  io: ServiceRuntimeIo,
): void {
  try {
    logRuntimeFailure(error, io);
  } catch {
    // Shutdown and the fatal service result must survive logging failure.
  }
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
