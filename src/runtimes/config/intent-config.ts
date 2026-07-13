import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";
import { isRecord } from "./config-parse-utils.js";

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
  value: unknown,
  registry: IntentProviderRegistry,
): ParsedIntentConfig {
  if (!isRecord(value)) {
    throw new Error("Config intent section must be a JSON object.");
  }

  if (typeof value.provider !== "string" || value.provider.length === 0) {
    throw new Error("Config intent.provider must be a non-empty string.");
  }

  return {
    provider: value.provider,
    resolvedProvider: resolveConfiguredRuntimeProvider({
      configuredId: value.provider,
      operationName: "intent",
      rawOperationConfig: value,
      registry,
    }),
  };
}

export function requireIntentConfig(config: {
  intent: ParsedIntentConfig;
}): ParsedIntentConfig {
  return config.intent;
}
