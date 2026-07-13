import type { AssistantCommandParameters } from "./assistant.js";
import type { FeatureExecutionRequest, FeaturePlugin } from "./feature.js";

export type DeterministicCapabilityRule = (
  normalizedText: string,
) => AssistantCommandParameters | undefined;

export interface DeterministicFeatureRule<TCapability extends string = string> {
  capability: TCapability;
  match: DeterministicCapabilityRule;
}

type FeatureCapabilityName<TFeature extends FeaturePlugin> =
  TFeature extends FeaturePlugin<infer TRequest extends FeatureExecutionRequest>
    ? TRequest["capability"]
    : never;

interface FeaturePluginWithDeterministicRules extends FeaturePlugin {
  deterministicIntentRules: DeterministicFeatureRule[];
}

export function defineDeterministicFeatureRules<TFeature extends FeaturePlugin>(
  feature: TFeature,
  deterministicIntentRules: readonly DeterministicFeatureRule<
    FeatureCapabilityName<TFeature>
  >[],
): TFeature & FeaturePluginWithDeterministicRules {
  return Object.assign(feature, {
    deterministicIntentRules: [...deterministicIntentRules],
  });
}

export function getDeterministicFeatureRules(
  feature: FeaturePlugin,
): DeterministicFeatureRule[] {
  if (hasDeterministicFeatureRules(feature)) {
    return feature.deterministicIntentRules;
  }

  return [];
}

function hasDeterministicFeatureRules(
  feature: FeaturePlugin,
): feature is FeaturePluginWithDeterministicRules {
  return (
    "deterministicIntentRules" in feature &&
    Array.isArray(feature.deterministicIntentRules)
  );
}
