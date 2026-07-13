import type { FeatureCapability } from "./feature.js";

export interface CapabilityCatalogFeature {
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

export interface CapabilityRoute<
  TFeature extends CapabilityCatalogFeature = CapabilityCatalogFeature,
> {
  capability: FeatureCapability;
  feature: TFeature;
}

export interface CapabilityRoutingIndex<
  TFeature extends CapabilityCatalogFeature = CapabilityCatalogFeature,
> {
  catalog: CapabilityCatalog;
  get(capabilityName: string): CapabilityRoute<TFeature> | undefined;
}

export function createCapabilityCatalog(
  features: CapabilityCatalogFeature[],
): CapabilityCatalog {
  return createCapabilityRoutingIndex(features).catalog;
}

export function createCapabilityRoutingIndex<
  TFeature extends CapabilityCatalogFeature,
>(features: readonly TFeature[]): CapabilityRoutingIndex<TFeature> {
  const catalog: CapabilityCatalog = [];
  const routes = new Map<string, CapabilityRoute<TFeature>>();

  for (const feature of features) {
    for (const capability of feature.capabilities) {
      const existing = routes.get(capability.name);

      if (existing) {
        throw new Error(
          `Capability "${capability.name}" is declared by both "${existing.feature.id}" and "${feature.id}".`,
        );
      }

      routes.set(capability.name, { capability, feature });
      catalog.push({
        capability,
        featureId: feature.id,
        featureName: feature.displayName,
        parameterText: formatCapabilityParameters(capability),
      });
    }
  }

  return {
    catalog,
    get: (capabilityName) => routes.get(capabilityName),
  };
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
