import type { FeatureCapability } from "./feature.js";

interface CapabilityCatalogFeature {
  capabilities: FeatureCapability[];
  displayName: string;
  id: string;
}

export interface CapabilityCatalogEntry {
  capability: FeatureCapability;
  featureId: string;
  featureName: string;
  parameterText: string;
}

export type CapabilityCatalog = CapabilityCatalogEntry[];

export function createCapabilityCatalog(
  features: CapabilityCatalogFeature[],
): CapabilityCatalog {
  return features.flatMap((feature) =>
    feature.capabilities.map((capability) => ({
      capability,
      featureId: feature.id,
      featureName: feature.displayName,
      parameterText: formatCapabilityParameters(capability),
    })),
  );
}

function formatCapabilityParameters(capability: FeatureCapability): string {
  const parameters = capability.parameters ?? {};
  const entries = Object.entries(parameters);

  if (entries.length === 0) {
    return "none";
  }

  return entries
    .map(([name, parameter]) => {
      const constraints = [
        parameter.required ? "required" : "optional",
        parameter.minimum === undefined
          ? undefined
          : `minimum ${parameter.minimum}`,
        parameter.positive ? "positive" : undefined,
      ].filter((constraint): constraint is string => constraint !== undefined);

      return `${name}: ${parameter.type}${constraints.length > 0 ? ` (${constraints.join(", ")})` : ""}`;
    })
    .join("; ");
}
