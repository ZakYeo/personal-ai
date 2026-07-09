import type { AssistantCommandParameters } from "./assistant.js";
import type { FeaturePlugin } from "./feature.js";

export type DeterministicCapabilityRule = (
  normalizedText: string,
) => AssistantCommandParameters | undefined;

export interface DeterministicFeatureRule {
  capability: string;
  match: DeterministicCapabilityRule;
}

interface FeaturePluginWithDeterministicRules extends FeaturePlugin {
  deterministicIntentRules: DeterministicFeatureRule[];
}

export function defineDeterministicFeatureRules<TFeature extends FeaturePlugin>(
  feature: TFeature,
  deterministicIntentRules: DeterministicFeatureRule[],
): TFeature & FeaturePluginWithDeterministicRules {
  return Object.assign(feature, { deterministicIntentRules });
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
