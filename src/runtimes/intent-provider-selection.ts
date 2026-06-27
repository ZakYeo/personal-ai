import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import type { LoadedRuntimeConfig } from "./config/config.js";

interface IntentInterpreterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export function createConfiguredIntentInterpreter(
  config: LoadedRuntimeConfig,
  features: FeaturePlugin[],
  dependencies: IntentInterpreterDependencies,
): IntentInterpreterPort {
  if (config.intent.provider === "deterministic") {
    return new DeterministicIntentInterpreter();
  }

  if (config.intent.provider === "openai") {
    if (!config.intent.openai) {
      throw new Error("Config intent.openai must be configured.");
    }

    return new OpenAIIntentInterpreter({
      capabilityCatalog: features.flatMap((feature) =>
        feature.capabilities.map((capability) => ({
          capability,
          featureId: feature.id,
          featureName: feature.displayName,
        })),
      ),
      config: config.intent.openai,
      env: dependencies.env,
      fetch: dependencies.fetch,
    });
  }

  throw new Error(
    `Config intent.provider "${config.intent.provider}" is not registered.`,
  );
}
