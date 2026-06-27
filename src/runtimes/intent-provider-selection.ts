import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { requireIntentConfig } from "./config/intent-config.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";

interface IntentInterpreterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export function createConfiguredIntentInterpreter(
  config: LoadedRuntimeConfig,
  features: FeaturePlugin[],
  dependencies: IntentInterpreterDependencies,
): IntentInterpreterPort {
  const intent = requireIntentConfig(config);

  if (intent.provider === "deterministic") {
    return new DeterministicIntentInterpreter();
  }

  if (intent.provider === "openai") {
    return new OpenAIIntentInterpreter({
      capabilityCatalog: createProviderCapabilityCatalog(features),
      config: intent.openai,
      env: dependencies.env,
      fetch: dependencies.fetch,
    });
  }

  const exhaustive: never = intent;
  return exhaustive;
}
