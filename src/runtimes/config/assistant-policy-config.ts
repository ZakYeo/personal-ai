import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type { LoadedRuntimeConfig } from "./config.js";

export function toAssistantPolicyConfig(
  config: LoadedRuntimeConfig,
): AssistantPolicyConfig {
  return {
    assistant: config.assistant,
    features: Object.fromEntries(
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
    ),
  };
}
