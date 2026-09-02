import type {
  CapabilityCatalog,
  CapabilityCatalogEntry,
  CapabilityCatalogFeature,
  CapabilityRoute,
  CapabilityRoutingIndex,
  FeatureCapability,
} from "../ports/capability-catalog.js";

export type { CapabilityRoutingIndex } from "../ports/capability-catalog.js";

export function createCapabilityCatalog(
  features: readonly CapabilityCatalogFeature[],
): CapabilityCatalog {
  return createCapabilityRoutingIndex(features).catalog;
}

export function createCapabilityRoutingIndex<
  TFeature extends CapabilityCatalogFeature,
>(features: readonly TFeature[]): CapabilityRoutingIndex<TFeature> {
  const catalog: CapabilityCatalogEntry[] = [];
  const routes = new Map<string, CapabilityRoute<TFeature>>();

  for (const feature of features) {
    const compiledFeature = Object.freeze({
      ...feature,
      capabilities: Object.freeze(feature.capabilities.map(freezeCapability)),
    }) as TFeature;

    for (const capability of compiledFeature.capabilities) {
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
          feature: compiledFeature,
        }),
      );
      catalog.push(
        Object.freeze({
          capability: frozenCapability,
          featureId: compiledFeature.id,
          featureName: compiledFeature.displayName,
          ...(compiledFeature.spokenSummary
            ? { featureSpokenSummary: compiledFeature.spokenSummary }
            : {}),
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
            Object.freeze({
              ...parameter,
              ...(parameter.type === "string" && parameter.allowedValues
                ? { allowedValues: Object.freeze([...parameter.allowedValues]) }
                : {}),
            }),
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
        parameter.type !== "number" || parameter.minimum === undefined
          ? undefined
          : `minimum ${parameter.minimum}`,
        parameter.type === "number" && parameter.positive
          ? "positive"
          : undefined,
        parameter.type === "string" && parameter.allowedValues
          ? `allowed ${parameter.allowedValues.join(" | ")}`
          : undefined,
      ].filter((constraint): constraint is string => constraint !== undefined);

      const details = [constraints.join(", "), parameter.description].filter(
        (detail): detail is string => Boolean(detail),
      );
      return `${name}: ${parameter.type}${details.length > 0 ? ` (${details.join("; ")})` : ""}`;
    })
    .join("; ");
}
