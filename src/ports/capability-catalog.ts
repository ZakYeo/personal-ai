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
