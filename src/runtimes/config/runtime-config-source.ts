import { loadConfigWithSource } from "./config.js";
import type { LoadedConfigSource, LoadedRuntimeConfig } from "./config.js";
import type { FeatureAdapterRegistry } from "../feature-adapter-registry.js";
import { isAbsolute } from "node:path";

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
