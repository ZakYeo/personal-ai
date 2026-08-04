import type { AssistantCommandParameters } from "./assistant.js";
import type { FeatureExecutionRequest, FeaturePlugin } from "./feature.js";

export type DeterministicCapabilityRule = (
  normalizedText: string,
) => AssistantCommandParameters | undefined;

export interface DeterministicFeatureRule<TCapability extends string = string> {
  capability: TCapability;
  match: DeterministicCapabilityRule;
}

export type FeatureCapabilityName<TFeature extends FeaturePlugin> =
  TFeature extends FeaturePlugin<infer TRequest extends FeatureExecutionRequest>
    ? TRequest["capability"]
    : never;

export interface FeaturePluginWithDeterministicRules extends FeaturePlugin {
  readonly deterministicIntentRules: readonly DeterministicFeatureRule[];
}
