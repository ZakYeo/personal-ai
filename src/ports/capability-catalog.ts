import type {
  AssistantContext,
  AssistantResponse,
  ConfirmationDeclaration,
} from "./assistant.js";

export interface FeatureCapability {
  readonly name: string;
  readonly risk: "low" | "high";
  readonly toolChain?: "read";
  readonly summary?: string;
  readonly spokenSummary?: string;
  readonly description?: string;
  readonly requiresConfirmation?: boolean;
  readonly parameters?: Readonly<Record<string, FeatureCapabilityParameter>>;
  readonly renderConfirmation?: (
    args: Readonly<Record<string, string | number | boolean | undefined>>,
    context: AssistantContext,
  ) => ConfirmationDeclaration;
  readonly requestClarification?: (
    args: Readonly<Record<string, string | number | boolean | undefined>>,
    context: AssistantContext,
  ) => AssistantResponse | undefined;
}

export interface FeatureCapabilityParameter {
  readonly type: "string" | "number" | "boolean";
  readonly description?: string;
  readonly required?: boolean;
  readonly minimum?: number;
  readonly positive?: boolean;
}

export interface CapabilityCatalogFeature {
  readonly capabilities: readonly FeatureCapability[];
  readonly displayName: string;
  readonly id: string;
  readonly spokenSummary?: string;
}

export interface CapabilityCatalogEntry {
  readonly capability: FeatureCapability;
  readonly featureId: string;
  readonly featureName: string;
  readonly featureSpokenSummary?: string;
  readonly parameterText: string;
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
  readonly catalog: CapabilityCatalog;
  get(capabilityName: string): CapabilityRoute<TFeature> | undefined;
}

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

      const details = [constraints.join(", "), parameter.description].filter(
        (detail): detail is string => Boolean(detail),
      );
      return `${name}: ${parameter.type}${details.length > 0 ? ` (${details.join("; ")})` : ""}`;
    })
    .join("; ");
}
