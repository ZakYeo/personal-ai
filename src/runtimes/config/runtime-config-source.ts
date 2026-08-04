import { loadConfigWithSource } from "./config.js";
import type { LoadedConfigSource, LoadedRuntimeConfig } from "./config.js";
import type { FeatureAdapterRegistry } from "../feature-adapter-registry.js";
import { createRuntimeFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import { rebindFeatureAdapters } from "./feature-config.js";
import { isAbsolute } from "node:path";
import type { DesktopVoiceProviderAdapterRegistry } from "../voice/desktop-voice-provider-adapter-registry.js";

export type RuntimeConfigSource =
  | LoadedConfigSource
  | { config: LoadedRuntimeConfig; configDirectory?: string };

interface ResolveRuntimeConfigSourceOptions {
  config?: LoadedRuntimeConfig;
  configDirectory?: string;
  load(): Promise<LoadedConfigSource>;
}

interface ConfiguredRuntimeConfigSourceOptions {
  config?: LoadedRuntimeConfig;
  configDirectory?: string;
  configPath?: string;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
  featureAdapterRegistry?: FeatureAdapterRegistry;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  notificationDelivery?: NotificationDeliveryPort;
}

export function resolveConfiguredRuntimeConfigSource(
  options: ConfiguredRuntimeConfigSourceOptions,
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
          : {
              createFeatureAdapterRegistry: (configDirectory: string) =>
                createRuntimeFeatureAdapterRegistry({
                  configDirectory,
                  env: options.env ?? process.env,
                  fetch: options.fetch ?? globalThis.fetch,
                  ...(options.notificationDelivery
                    ? {
                        notificationDelivery: options.notificationDelivery,
                      }
                    : {}),
                }),
            }),
      }),
  }).then((source) =>
    options.config &&
    !options.featureAdapterRegistry &&
    hasFeatureBindingOverrides(options)
      ? rebindRuntimeConfigSource(source, options)
      : source,
  );
}

function hasFeatureBindingOverrides(
  options: ConfiguredRuntimeConfigSourceOptions,
): boolean {
  return (
    options.configDirectory !== undefined ||
    options.env !== undefined ||
    options.fetch !== undefined ||
    options.notificationDelivery !== undefined
  );
}

function rebindRuntimeConfigSource(
  source: RuntimeConfigSource,
  options: ConfiguredRuntimeConfigSourceOptions,
): RuntimeConfigSource {
  const registry = createRuntimeFeatureAdapterRegistry({
    ...(source.configDirectory
      ? { configDirectory: source.configDirectory }
      : {}),
    env: options.env ?? process.env,
    fetch: options.fetch ?? globalThis.fetch,
    ...(options.notificationDelivery
      ? { notificationDelivery: options.notificationDelivery }
      : {}),
  });
  return {
    ...source,
    config: {
      ...source.config,
      features: rebindFeatureAdapters(source.config.features, registry, {
        preserveUnregistered: true,
      }),
    },
  };
}

export async function resolveRuntimeConfigSource(
  options: ResolveRuntimeConfigSourceOptions,
): Promise<RuntimeConfigSource> {
  if (!options.config) {
    return validateRuntimeConfigSource(await options.load());
  }

  return validateRuntimeConfigSource({
    config: options.config,
    ...(options.configDirectory
      ? { configDirectory: options.configDirectory }
      : {}),
  });
}

function validateRuntimeConfigSource(
  source: RuntimeConfigSource,
): RuntimeConfigSource {
  if (
    source.configDirectory !== undefined &&
    !isAbsolute(source.configDirectory)
  ) {
    throw new Error("Runtime config directory must be absolute.");
  }

  return source;
}
