import { loadConfigWithSource } from "./config.js";
import type { LoadedConfigSource, LoadedRuntimeConfig } from "./config.js";
import type { FeatureAdapterRegistry } from "../feature-adapter-registry.js";

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
  featureAdapterRegistry?: FeatureAdapterRegistry;
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
        ...(options.featureAdapterRegistry
          ? { featureAdapterRegistry: options.featureAdapterRegistry }
          : {}),
      }),
  });
}

export function resolveRuntimeConfigSource(
  options: ResolveRuntimeConfigSourceOptions,
): Promise<RuntimeConfigSource> {
  if (!options.config) {
    return options.load();
  }

  return Promise.resolve({
    config: options.config,
    ...(options.configDirectory
      ? { configDirectory: options.configDirectory }
      : {}),
  });
}
