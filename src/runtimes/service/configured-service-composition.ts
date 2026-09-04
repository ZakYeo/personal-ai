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
import { createHumanizedNotificationDelivery } from "../humanized-notification-delivery.js";
import type { RuntimeServiceRegistry } from "../runtime-service-registry.js";

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
  shutdownGraceMs?: number;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
}

interface ConfiguredServiceTurnContext extends ServiceTurnContext {
  config: LoadedRuntimeConfig;
  services: RuntimeServiceRegistry;
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
    services: RuntimeServiceRegistry;
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

  return runServiceRuntime({
    backgroundTasks: startup.backgroundTasks,
    ...(options.backgroundTaskTimer
      ? { backgroundTaskTimer: options.backgroundTaskTimer }
      : {}),
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
    ...(options.runBackgroundTask
      ? { runBackgroundTask: options.runBackgroundTask }
      : {}),
    runTurn: (context) =>
      callbacks.runTurn({
        ...context,
        config: startup.config,
        services: startup.services,
      }),
    ...(options.shutdownGraceMs === undefined
      ? {}
      : { shutdownGraceMs: options.shutdownGraceMs }),
    ...(options.shutdownHooks ? { shutdownHooks: options.shutdownHooks } : {}),
  });
}

async function createConfiguredServiceStartup(
  options: ConfiguredServiceCompositionOptions,
  validateConfig: (config: LoadedRuntimeConfig) => Promise<void> | void,
): Promise<{
  assistant: Assistant;
  backgroundTasks: RuntimeBackgroundTask[];
  config: LoadedRuntimeConfig;
  services: RuntimeServiceRegistry;
}> {
  const deferredDelivery = options.createNotificationDelivery
    ? createDeferredNotificationDelivery()
    : undefined;
  const configSource = await loadServiceConfig(options, deferredDelivery?.port);
  const { config } = configSource;
  if (deferredDelivery && options.createNotificationDelivery) {
    deferredDelivery.bind(
      createHumanizedNotificationDelivery(
        options.createNotificationDelivery({ config }),
        {
          now: options.now ?? (() => new Date()),
          timeZone: config.assistant.timeZone,
        },
      ),
    );
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
