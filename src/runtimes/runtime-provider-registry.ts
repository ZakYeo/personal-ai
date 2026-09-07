import type { ProcessingLocation } from "./processing-inspection.js";
import { selectConfiguredRuntimeEntry } from "./runtime-selector.js";

export interface ResolvedRuntimeProvider<TContext, TResult> {
  readonly processing?: ProcessingLocation;
  create(context: TContext): TResult;
}

export interface RuntimeProviderEntry<TContext, TResult> {
  resolve(
    rawOperationConfig: Readonly<Record<string, unknown>>,
  ): ResolvedRuntimeProvider<TContext, TResult>;
}

interface RuntimeProviderDefinition<TConfig, TContext, TResult> {
  processing?: ProcessingLocation;
  configKey?: string;
  create(config: TConfig, context: TContext): TResult;
  parseConfig(value: unknown): TConfig;
}

export function defineRuntimeProvider<TConfig, TContext, TResult>(
  definition: RuntimeProviderDefinition<TConfig, TContext, TResult>,
): RuntimeProviderEntry<TContext, TResult> {
  return {
    resolve: (rawOperationConfig) => {
      const config = definition.parseConfig(
        definition.configKey
          ? rawOperationConfig[definition.configKey]
          : undefined,
      );

      return {
        ...(definition.processing ? { processing: definition.processing } : {}),
        create: (context) => definition.create(config, context),
      };
    },
  };
}

export function defineConfiglessRuntimeProvider<TContext, TResult>(
  create: (context: TContext) => TResult,
  processing?: ProcessingLocation,
): RuntimeProviderEntry<TContext, TResult> {
  return {
    resolve: () => ({ create, ...(processing ? { processing } : {}) }),
  };
}

export function resolveConfiguredRuntimeProvider<TContext, TResult>(options: {
  configuredId: string;
  operationName: string;
  rawOperationConfig: Readonly<Record<string, unknown>>;
  registry: Record<string, RuntimeProviderEntry<TContext, TResult>>;
}): ResolvedRuntimeProvider<TContext, TResult> {
  const entry = selectConfiguredRuntimeEntry({
    configuredId: options.configuredId,
    missingMessage: `Config ${options.operationName}.provider must be configured.`,
    registry: options.registry,
    unknownMessage: (provider) =>
      `Config ${options.operationName}.provider "${provider}" is not registered.`,
  });

  return entry.resolve(options.rawOperationConfig);
}
