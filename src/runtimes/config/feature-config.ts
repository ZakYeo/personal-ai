import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import { isRecord } from "./config-parse-utils.js";

export type ParsedFeatureConfig = Record<string, unknown> &
  AssistantPolicyConfig["features"][string] & {
    adapter?: string;
  };

export type ParsedFeaturesConfig = Record<string, ParsedFeatureConfig>;

export function parseFeaturesConfig(
  value: Record<string, unknown>,
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

    features[featureId] = {
      ...featureConfig,
      enabled: featureConfig.enabled,
      ...parseFeatureAdapter(featureId, featureConfig),
      ...parseConfirmationRequiredCapabilities(featureId, featureConfig),
    };
  }

  return features;
}

function parseFeatureAdapter(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Pick<ParsedFeatureConfig, "adapter"> {
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
): Pick<ParsedFeatureConfig, "confirmationRequiredCapabilities"> {
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
