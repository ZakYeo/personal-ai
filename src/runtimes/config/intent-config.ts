import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";

export interface IntentProviderDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export interface IntentProviderContext {
  dependencies: IntentProviderDependencies;
  features: FeaturePlugin[];
}

export type IntentProviderRegistry = Record<
  string,
  RuntimeProviderEntry<IntentProviderContext, IntentInterpreterPort>
>;

export interface ParsedIntentConfig {
  provider: string;
  resolvedProvider: ResolvedRuntimeProvider<
    IntentProviderContext,
    IntentInterpreterPort
  >;
}

export function parseIntentConfig(
  intent: Record<string, unknown>,
  registry: IntentProviderRegistry,
): ParsedIntentConfig {
  const provider = intent.provider as string;

  return {
    provider,
    resolvedProvider: resolveConfiguredRuntimeProvider({
      configuredId: provider,
      operationName: "intent",
      rawOperationConfig: intent,
      registry,
    }),
  };
}

export function requireIntentConfig(config: {
  intent: ParsedIntentConfig;
}): ParsedIntentConfig {
  return config.intent;
}
