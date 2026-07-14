import type { AssistantContext, ConfirmationDeclaration } from "./assistant.js";

export interface FeatureCapability {
  name: string;
  risk: "low" | "high";
  summary?: string;
  spokenSummary?: string;
  description?: string;
  requiresConfirmation?: boolean;
  parameters?: Record<string, FeatureCapabilityParameter>;
  renderConfirmation?: (
    args: Record<string, string | number | boolean | undefined>,
    context: AssistantContext,
  ) => ConfirmationDeclaration;
}

export interface FeatureCapabilityParameter {
  type: "string" | "number" | "boolean";
  required?: boolean;
  minimum?: number;
  positive?: boolean;
}

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

export type CapabilityCatalog = readonly CapabilityCatalogEntry[];

export interface CapabilityRoute<
  TFeature extends CapabilityCatalogFeature = CapabilityCatalogFeature,
> {
  readonly capability: FeatureCapability;
  readonly feature: TFeature;
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
  const catalog: CapabilityCatalogEntry[] = [];
  const routes = new Map<string, CapabilityRoute<TFeature>>();

  for (const feature of features) {
    for (const capability of feature.capabilities) {
      const existing = routes.get(capability.name);

      if (existing) {
        throw new Error(
          `Capability "${capability.name}" is declared by both "${existing.feature.id}" and "${feature.id}".`,
        );
      }

      const frozenCapability = freezeCapability(capability);

      routes.set(
        capability.name,
        Object.freeze({
          capability: frozenCapability,
          feature,
        }),
      );
      catalog.push(
        Object.freeze({
          capability: frozenCapability,
          featureId: feature.id,
          featureName: feature.displayName,
          parameterText: formatCapabilityParameters(frozenCapability),
        }),
      );
    }
  }

  return {
    catalog: Object.freeze(catalog),
    get: (capabilityName) => routes.get(capabilityName),
  };
}

function freezeCapability(capability: FeatureCapability): FeatureCapability {
  const parameters = capability.parameters
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(capability.parameters).map(([name, parameter]) => [
            name,
            Object.freeze({ ...parameter }),
          ]),
        ),
      )
    : undefined;

  return Object.freeze({
    ...capability,
    ...(parameters ? { parameters } : {}),
  });
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
