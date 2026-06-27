import type { FeatureCapability, FeaturePlugin } from "../ports/feature.js";

interface ProviderIntentCapability {
  capability: FeatureCapability;
  featureId: string;
  featureName: string;
}

export function createProviderCapabilityCatalog(
  features: FeaturePlugin[],
): ProviderIntentCapability[] {
  return features.flatMap((feature) =>
    feature.capabilities.map((capability) => ({
      capability,
      featureId: feature.id,
      featureName: feature.displayName,
    })),
  );
}
