import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type {
  FeatureAdapterRegistry,
  ResolvedFeatureAdapter,
} from "../feature-adapter-registry.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import { isRecord } from "./config-parse-utils.js";

type ParsedCommonFeatureConfig = AssistantPolicyConfig["features"][string] & {
  adapter?: string;
};

export interface ParsedFeatureConfig extends ParsedCommonFeatureConfig {
  resolvedAdapter?: ResolvedFeatureAdapter;
}

export type ParsedFeaturesConfig = Record<string, ParsedFeatureConfig>;

export function parseFeaturesConfig(
  value: Record<string, unknown>,
  registry: FeatureAdapterRegistry,
): ParsedFeaturesConfig {
  const features: ParsedFeaturesConfig = {};

  for (const [featureId, featureConfig] of Object.entries(value)) {
    if (!isRecord(featureConfig)) {
      throw new Error(`Config feature "${featureId}" must be a JSON object.`);
    }

    if (typeof featureConfig.enabled !== "boolean") {
      throw new Error(
        `Config feature "${featureId}".enabled must be a boolean.`,
      );
    }

    const commonConfig = {
      enabled: featureConfig.enabled,
      ...parseFeatureAdapter(featureId, featureConfig),
      ...parseConfirmationRequiredCapabilities(featureId, featureConfig),
    };
    const parsed: ParsedFeatureConfig = {
      ...commonConfig,
      ...(commonConfig.enabled
        ? {
            resolvedAdapter: parseSelectedFeatureAdapter(
              featureId,
              featureConfig,
              commonConfig.adapter,
              registry,
            ),
          }
        : {}),
    };

    features[featureId] = parsed;
  }

  return features;
}

function parseFeatureAdapter(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Pick<ParsedCommonFeatureConfig, "adapter"> {
  const value = featureConfig.adapter;

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Config feature "${featureId}".adapter must be a non-empty string.`,
    );
  }

  return {
    adapter: value,
  };
}

function parseConfirmationRequiredCapabilities(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Pick<ParsedCommonFeatureConfig, "confirmationRequiredCapabilities"> {
  const value = featureConfig.confirmationRequiredCapabilities;

  if (value === undefined) {
    return {};
  }

  if (
    !Array.isArray(value) ||
    !value.every((capability) => typeof capability === "string")
  ) {
    throw new Error(
      `Config feature "${featureId}".confirmationRequiredCapabilities must be a string array.`,
    );
  }

  return {
    confirmationRequiredCapabilities: value,
  };
}

function parseSelectedFeatureAdapter(
  featureId: string,
  featureConfig: Record<string, unknown>,
  adapterId: string | undefined,
  registry: FeatureAdapterRegistry,
): ResolvedFeatureAdapter {
  const featureRegistry = registry[featureId];

  if (!featureRegistry) {
    throw new Error(`Config feature "${featureId}" is not registered.`);
  }

  const adapter = selectConfiguredRuntimeEntry({
    configuredId: adapterId,
    missingMessage: `Config feature "${featureId}".adapter must be set for enabled features.`,
    registry: featureRegistry.adapters,
    unknownMessage: (configuredAdapterId) =>
      `Config feature "${featureId}" adapter "${configuredAdapterId}" is not registered.`,
  });

  return adapter.parse(featureConfig);
}
