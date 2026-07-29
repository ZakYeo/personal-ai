import type { Assistant } from "../../core/assistant/index.js";
import {
  createConfiguredTextRuntimeCompositionFromResolvedSource,
  type ConfiguredTextRuntimeOptions,
} from "../configured-text-runtime.js";
import { type LoadedRuntimeConfig } from "../config/config.js";
import {
  resolveConfiguredRuntimeConfigSource,
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
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";
import { createDeferredNotificationDelivery } from "../deferred-notification-delivery.js";

interface ConfiguredServiceCompositionOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "configDirectory" | "env" | "featureAdapterRegistry" | "fetch" | "now"
> {
  createNotificationDelivery?: (context: {
    config: LoadedRuntimeConfig;
  }) => NotificationDeliveryPort;
  config?: LoadedRuntimeConfig;
  configPath?: string;
  backgroundTaskTimer?: RuntimeBackgroundTaskContext["timer"];
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
  validateConfig(config: LoadedRuntimeConfig): Promise<void> | void;
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
    startup = await createConfiguredServiceStartup(options, (config) =>
      callbacks.validateConfig(config),
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
                ...(options.backgroundTaskTimer
                  ? { timer: options.backgroundTaskTimer }
                  : {}),
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
  validateConfig: (config: LoadedRuntimeConfig) => Promise<void> | void,
): Promise<{
  assistant: Assistant;
  backgroundTasks: RuntimeBackgroundTask[];
  config: LoadedRuntimeConfig;
}> {
  const deferredDelivery = options.createNotificationDelivery
    ? createDeferredNotificationDelivery()
    : undefined;
  const configSource = await loadServiceConfig(options, deferredDelivery?.port);
  const { config } = configSource;
  if (deferredDelivery && options.createNotificationDelivery) {
    deferredDelivery.bind(options.createNotificationDelivery({ config }));
  }
  await validateConfig(config);

  const composition = createConfiguredTextRuntimeCompositionFromResolvedSource(
    configSource,
    {
      env: options.env ?? process.env,
      fetch: options.fetch ?? globalThis.fetch,
      ...(options.now ? { now: options.now } : {}),
    },
  );

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
  notificationDelivery: NotificationDeliveryPort | undefined,
): Promise<RuntimeConfigSource> {
  return resolveConfiguredRuntimeConfigSource({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configDirectory
      ? { configDirectory: options.configDirectory }
      : {}),
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
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(notificationDelivery ? { notificationDelivery } : {}),
  });
}
