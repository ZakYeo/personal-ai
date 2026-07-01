import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { FeaturePlugin } from "../ports/feature.js";
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
  dependencies: IntentInterpreterDependencies;
  features: FeaturePlugin[];
  intent: TIntent;
}) => IntentInterpreterPort;

type IntentProviderRegistry = {
  [TIntent in ResolvedIntentConfig as TIntent["provider"]]?: IntentProviderFactory<TIntent>;
};

interface CreateConfiguredIntentInterpreterOptions {
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

  return factory({ dependencies, features, intent });
}

function createDefaultIntentProviderRegistry(): Required<IntentProviderRegistry> {
  return {
    deterministic: () => new DeterministicIntentInterpreter(),
    openai: ({ dependencies, features, intent }) =>
      new OpenAIIntentInterpreter({
        capabilityCatalog: createProviderCapabilityCatalog(features),
        config: intent.openai,
        env: dependencies.env,
        fetch: dependencies.fetch,
      }),
  };
}
