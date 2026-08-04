import type {
  DeterministicFeatureRule,
  FeatureCapabilityName,
  FeaturePluginWithDeterministicRules,
} from "../ports/deterministic-feature-rules.js";
import type { FeaturePlugin } from "../ports/feature.js";

export type { DeterministicFeatureRule } from "../ports/deterministic-feature-rules.js";

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
): readonly DeterministicFeatureRule[] {
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
