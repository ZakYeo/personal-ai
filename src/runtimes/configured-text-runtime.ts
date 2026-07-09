import { createAssistant } from "../core/assistant/index.js";
import type { Assistant } from "../core/assistant/index.js";
import type { ClockPort } from "../ports/assistant.js";
import { loadConfig, type LoadedRuntimeConfig } from "./config/config.js";
import { toAssistantPolicyConfig } from "./config/assistant-policy-config.js";
import { createConfiguredConversation } from "./conversation-provider-selection.js";
import { createConfiguredFeatureSelection } from "./feature-adapter-selection.js";
import { createConfiguredIntentInterpreter } from "./intent-provider-selection.js";

export interface ConfiguredTextRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
}

export async function createConfiguredTextRuntime(
  options: ConfiguredTextRuntimeOptions = {},
): Promise<Assistant> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const clock = createClock(options.now);
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const featureSelection = createConfiguredFeatureSelection(config, {
    dependencies: {
      env,
      fetch,
    },
  });
  const conversation = createConfiguredConversation(
    config,
    featureSelection.features,
    {
      env,
      fetch,
    },
  );

  return createAssistant({
    clock,
    config: toAssistantPolicyConfig(config, {
      additionalEnabledFeatures: ["assistant"],
    }),
    ...(conversation ? { conversation } : {}),
    features: featureSelection.features,
    intentInterpreter: createConfiguredIntentInterpreter(
      config,
      featureSelection.features,
      {
        env,
        fetch,
      },
    ),
  });
}

function createClock(now: (() => Date) | undefined): ClockPort {
  if (now) {
    return {
      now,
    };
  }

  return {
    now: () => new Date(),
  };
}
