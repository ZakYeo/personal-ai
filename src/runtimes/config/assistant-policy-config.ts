import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type { LoadedRuntimeConfig } from "./config.js";

export function toAssistantPolicyConfig(
  config: LoadedRuntimeConfig,
  options: { enabledFeatureIds?: string[] } = {},
): AssistantPolicyConfig {
  return {
    assistant: config.assistant,
    features: options.enabledFeatureIds
      ? createSelectedFeaturePolicy(config, options.enabledFeatureIds)
      : createConfiguredFeaturePolicy(config),
  };
}

function createSelectedFeaturePolicy(
  config: LoadedRuntimeConfig,
  featureIds: string[],
): AssistantPolicyConfig["features"] {
  return Object.fromEntries(
    featureIds.map((featureId) => {
      const featureConfig = config.features[featureId];

      return [
        featureId,
        {
          enabled: true,
          ...(featureConfig?.confirmationRequiredCapabilities
            ? {
                confirmationRequiredCapabilities:
                  featureConfig.confirmationRequiredCapabilities,
              }
            : {}),
        },
      ];
    }),
  );
}

function createConfiguredFeaturePolicy(
  config: LoadedRuntimeConfig,
): AssistantPolicyConfig["features"] {
  return Object.fromEntries(
    Object.entries(config.features).map(([featureId, featureConfig]) => [
      featureId,
      {
        enabled: featureConfig.enabled,
        ...(featureConfig.confirmationRequiredCapabilities
          ? {
              confirmationRequiredCapabilities:
                featureConfig.confirmationRequiredCapabilities,
            }
          : {}),
      },
    ]),
  );
}
