import { createAssistant } from "../core/assistant/index.js";
import type { Assistant } from "../core/assistant/index.js";
import type { ClockPort } from "../ports/assistant.js";
import {
  loadConfig,
  toAssistantPolicyConfig,
  type LoadedRuntimeConfig,
} from "./config/config.js";
import { createConfiguredFeatures } from "./feature-adapter-selection.js";
import { createConfiguredIntentInterpreter } from "./intent-provider-selection.js";

interface DeterministicRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: Date;
}

export async function createDeterministicRuntime(
  options: DeterministicRuntimeOptions = {},
): Promise<Assistant> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const clock = createClock(options.now);
  const features = createConfiguredFeatures(config);

  return createAssistant({
    clock,
    config: toAssistantPolicyConfig(config),
    features,
    intentInterpreter: createConfiguredIntentInterpreter(config, features, {
      env: options.env ?? process.env,
      fetch: options.fetch ?? globalThis.fetch,
    }),
  });
}

function createClock(now: Date | undefined): ClockPort {
  if (now) {
    return {
      now: () => now,
    };
  }

  return {
    now: () => new Date(),
  };
}
