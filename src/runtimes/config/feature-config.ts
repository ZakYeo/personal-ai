import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type { GoogleCalendarConfig } from "../../ports/calendar.js";
import { parseCalendarFeatureConfig } from "./calendar-feature-config.js";
import { isRecord } from "./config-parse-utils.js";

type ParsedCommonFeatureConfig = AssistantPolicyConfig["features"][string] & {
  adapter?: string;
};

export interface ParsedFeatureConfig extends ParsedCommonFeatureConfig {
  google?: GoogleCalendarConfig;
}

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

    const parsed = {
      enabled: featureConfig.enabled,
      ...parseFeatureAdapter(featureId, featureConfig),
      ...parseConfirmationRequiredCapabilities(featureId, featureConfig),
      ...parseSelectedFeatureAdapterConfig(featureId, featureConfig),
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

function parseSelectedFeatureAdapterConfig(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Partial<ParsedFeatureConfig> {
  if (featureId !== "calendar" || featureConfig.adapter !== "google") {
    return {};
  }

  return parseCalendarFeatureConfig(featureConfig);
}
