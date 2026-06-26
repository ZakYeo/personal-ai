import type { AssistantConfig } from "../../ports/assistant.js";
import type { FeatureCapability, FeaturePlugin } from "../../ports/feature.js";
import { createAppError, type AppError } from "./app-error.js";

export function evaluateConfirmationPolicy(
  feature: FeaturePlugin,
  capability: FeatureCapability,
  config: AssistantConfig,
): AppError | undefined {
  const featureConfig = config.features[feature.id];
  const configRequiresConfirmation =
    featureConfig?.confirmationRequiredCapabilities?.includes(
      capability.name,
    ) === true;

  if (
    capability.risk === "high" ||
    capability.requiresConfirmation === true ||
    configRequiresConfirmation
  ) {
    return createAppError({
      category: "confirmation_required",
      capability: capability.name,
      message: `${capability.name} requires confirmation.`,
    });
  }

  return undefined;
}
