import type { FeaturePlugin } from "../ports/feature.js";
import type { ClockPort } from "../ports/assistant.js";
import type { RuntimeBackgroundTask } from "./background-task.js";

export interface FeatureAdapterRuntimeContext {
  clock: ClockPort;
}

interface FeatureAdapterContext<TAdapterConfig> {
  adapterConfig: TAdapterConfig;
  runtime: FeatureAdapterRuntimeContext;
}

interface FeatureAdapterBinding<TAdapterConfig> {
  create(
    context: FeatureAdapterContext<TAdapterConfig>,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(adapterConfig: TAdapterConfig): void;
}

interface ConfiglessFeatureAdapterBinding {
  create(
    context: Pick<FeatureAdapterContext<never>, "runtime">,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(): void;
}

interface FeatureAdapterEntryDefinition<
  TAdapterConfig,
> extends FeatureAdapterBinding<TAdapterConfig> {
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
}

export interface ResolvedFeatureAdapter {
  create(
    runtime: FeatureAdapterRuntimeContext,
  ): FeaturePlugin | FeatureAdapterComposition;
  readonly parsedConfig: ParsedFeatureAdapterConfig;
  validateStartup?(): void;
}

export interface FeatureAdapterComposition {
  backgroundTasks?: RuntimeBackgroundTask[];
  feature: FeaturePlugin;
}

export interface FeatureAdapterEntry {
  parse(featureConfig: Record<string, unknown>): ResolvedFeatureAdapter;
  rebind(parsedConfig: ParsedFeatureAdapterConfig): ResolvedFeatureAdapter;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

const parsedConfigDefinition = Symbol("parsedFeatureAdapterConfigDefinition");

export interface ParsedFeatureAdapterConfig {
  readonly [parsedConfigDefinition]: symbol;
  readonly value: unknown;
}

export function defineFeatureAdapter<TAdapterConfig>(definition: {
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
}) {
  const definitionId = Symbol("featureAdapterDefinition");

  return {
    bind(binding: FeatureAdapterBinding<TAdapterConfig>): FeatureAdapterEntry {
      const resolve = (
        parsedConfig: ParsedFeatureAdapterConfig,
      ): ResolvedFeatureAdapter => {
        requireCompatibleParsedConfig(parsedConfig, definitionId);
        const adapterConfig = parsedConfig.value as TAdapterConfig;
        const resolved: ResolvedFeatureAdapter = {
          create: (runtime) =>
            binding.create({
              adapterConfig,
              runtime,
            }),
          parsedConfig,
          ...(binding.validateStartup
            ? {
                validateStartup: () => binding.validateStartup?.(adapterConfig),
              }
            : {}),
        };
        return resolved;
      };

      return {
        parse: (featureConfig) =>
          resolve(
            createParsedConfig(
              definitionId,
              definition.parseConfig(featureConfig),
            ),
          ),
        rebind: resolve,
      };
    },
  };
}

const configlessDefinitionId = Symbol("configlessFeatureAdapterDefinition");

export function defineConfiglessFeatureAdapterEntry(
  binding: ConfiglessFeatureAdapterBinding,
): FeatureAdapterEntry {
  const resolve = (
    parsedConfig: ParsedFeatureAdapterConfig,
  ): ResolvedFeatureAdapter => {
    requireCompatibleParsedConfig(parsedConfig, configlessDefinitionId);
    return {
      create: (runtime) => binding.create({ runtime }),
      parsedConfig,
      ...(binding.validateStartup
        ? { validateStartup: () => binding.validateStartup?.() }
        : {}),
    };
  };

  return {
    parse: () => resolve(createParsedConfig(configlessDefinitionId, undefined)),
    rebind: resolve,
  };
}

export function defineFeatureAdapterEntry<TAdapterConfig>(
  entry: FeatureAdapterEntryDefinition<TAdapterConfig>,
): FeatureAdapterEntry {
  return defineFeatureAdapter({
    parseConfig: (featureConfig) => entry.parseConfig(featureConfig),
  }).bind(entry);
}

function createParsedConfig(
  definitionId: symbol,
  value: unknown,
): ParsedFeatureAdapterConfig {
  return Object.freeze({
    [parsedConfigDefinition]: definitionId,
    value,
  });
}

function requireCompatibleParsedConfig(
  parsedConfig: ParsedFeatureAdapterConfig,
  definitionId: symbol,
): void {
  if (parsedConfig[parsedConfigDefinition] !== definitionId) {
    throw new Error(
      "Feature adapter parsed configuration is incompatible with the selected registry entry.",
    );
  }
}
