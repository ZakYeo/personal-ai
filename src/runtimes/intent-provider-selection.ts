import {
  DeterministicIntentInterpreter,
  type DeterministicIntentRule,
} from "../adapters/mock/deterministic-intent-interpreter.js";
import type {
  DeterministicFeatureRule,
  FeaturePlugin,
} from "../ports/feature.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import {
  requireIntentConfig,
  type ResolvedIntentConfig,
} from "./config/intent-config.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";

interface IntentInterpreterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

type IntentProviderFactory<TIntent extends ResolvedIntentConfig> = (context: {
  config: LoadedRuntimeConfig;
  dependencies: IntentInterpreterDependencies;
  deterministicRules: DeterministicFeatureRule[];
  features: FeaturePlugin[];
  intent: TIntent;
}) => IntentInterpreterPort;

type IntentProviderRegistry = {
  [TIntent in ResolvedIntentConfig as TIntent["provider"]]?: IntentProviderFactory<TIntent>;
};

interface CreateConfiguredIntentInterpreterOptions {
  deterministicRules?: DeterministicFeatureRule[];
  registry?: IntentProviderRegistry;
}

export function createConfiguredIntentInterpreter(
  config: LoadedRuntimeConfig,
  features: FeaturePlugin[],
  dependencies: IntentInterpreterDependencies,
  options: CreateConfiguredIntentInterpreterOptions = {},
): IntentInterpreterPort {
  const intent = requireIntentConfig(config);
  const registry = options.registry ?? createDefaultIntentProviderRegistry();
  const factory = registry[intent.provider] as
    | IntentProviderFactory<typeof intent>
    | undefined;

  if (!factory) {
    throw new Error(
      `Intent provider "${intent.provider}" does not have a registered factory.`,
    );
  }

  return factory({
    config,
    dependencies,
    deterministicRules: options.deterministicRules ?? [],
    features,
    intent,
  });
}

function createDefaultIntentProviderRegistry(): Required<IntentProviderRegistry> {
  return {
    deterministic: ({ deterministicRules, features }) =>
      new DeterministicIntentInterpreter(
        createDeterministicIntentRules(features, deterministicRules),
      ),
    openai: ({ dependencies, features, intent }) =>
      new OpenAIIntentInterpreter({
        capabilityCatalog: createProviderCapabilityCatalog(features),
        config: intent.openai,
        env: dependencies.env,
        fetch: dependencies.fetch,
      }),
  };
}

function createDeterministicIntentRules(
  features: FeaturePlugin[],
  configuredRules: DeterministicFeatureRule[],
): DeterministicIntentRule[] {
  const featureBackedRules = features.flatMap((feature) =>
    feature.capabilities.flatMap((capability) =>
      (capability.deterministicRules ?? []).map((match) => ({
        capability: capability.name,
        match,
      })),
    ),
  );

  return [...featureBackedRules, ...configuredRules].filter(
    (rule, index, rules) =>
      rules.findIndex(
        (candidate) =>
          candidate.capability === rule.capability &&
          candidate.match === rule.match,
      ) === index,
  );
}
