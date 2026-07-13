import {
  DeterministicIntentInterpreter,
  type DeterministicIntentRule,
} from "../adapters/mock/deterministic-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { OpenAIResponsesConfig } from "../adapters/openai/openai-responses-config.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { CapabilityCatalog } from "../ports/capability-catalog.js";
import { getDeterministicFeatureRules } from "../ports/deterministic-feature-rules.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import type {
  IntentProviderDependencies,
  IntentProviderRegistry,
  ParsedIntentConfig,
} from "./config/intent-config.js";
import { parseOpenAIResponsesConfig } from "./config/openai-responses-config.js";
import {
  defineConfiglessRuntimeProvider,
  defineRuntimeProvider,
} from "./runtime-provider-registry.js";

export function createConfiguredIntentInterpreter(
  config: { intent: ParsedIntentConfig },
  features: FeaturePlugin[],
  capabilityCatalog: CapabilityCatalog,
  dependencies: IntentProviderDependencies,
): IntentInterpreterPort {
  return config.intent.resolvedProvider.create({
    capabilityCatalog,
    dependencies,
    features,
  });
}

export function createDefaultIntentProviderRegistry(): IntentProviderRegistry {
  return {
    deterministic: defineConfiglessRuntimeProvider(({ features }) => {
      return new DeterministicIntentInterpreter(
        createDeterministicIntentRules(features),
      );
    }),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        providerConfig: OpenAIResponsesConfig,
        { capabilityCatalog, dependencies },
      ) =>
        new OpenAIIntentInterpreter({
          capabilityCatalog,
          config: providerConfig,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
      parseConfig: (value) =>
        parseOpenAIResponsesConfig(value, "Config intent.openai"),
    }),
  };
}

function createDeterministicIntentRules(
  features: FeaturePlugin[],
): DeterministicIntentRule[] {
  const featureBackedRules = features.flatMap((feature) =>
    getDeterministicFeatureRules(feature),
  );

  return featureBackedRules.filter(
    (rule, index, rules) =>
      rules.findIndex(
        (candidate) =>
          candidate.capability === rule.capability &&
          candidate.match === rule.match,
      ) === index,
  );
}
