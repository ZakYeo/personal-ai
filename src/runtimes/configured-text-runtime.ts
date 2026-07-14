import { createAssistant } from "../core/assistant/index.js";
import type { Assistant } from "../core/assistant/index.js";
import type { ClockPort } from "../ports/assistant.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { toAssistantPolicyConfig } from "./config/assistant-policy-config.js";
import { createConfiguredConversation } from "./conversation-provider-selection.js";
import { createConfiguredFeatureSelection } from "./feature-adapter-selection.js";
import { createConfiguredIntentInterpreter } from "./intent-provider-selection.js";
import { createConfiguredResponseRewriter } from "./response-rewriter-selection.js";
import type { FeatureAdapterRegistry } from "./feature-adapter-registry.js";
import type { AlarmStore } from "../ports/alarm-store.js";
import { resolveConfiguredRuntimeConfigSource } from "./config/runtime-config-source.js";

export interface ConfiguredTextRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configDirectory?: string;
  configPath?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  featureAdapterRegistry?: FeatureAdapterRegistry;
  now?: () => Date;
}

export async function createConfiguredTextRuntime(
  options: ConfiguredTextRuntimeOptions = {},
): Promise<Assistant> {
  return (await createConfiguredTextRuntimeComposition(options)).assistant;
}

interface ConfiguredTextRuntimeComposition {
  alarmStore?: AlarmStore;
  assistant: Assistant;
}

export async function createConfiguredTextRuntimeComposition(
  options: ConfiguredTextRuntimeOptions = {},
): Promise<ConfiguredTextRuntimeComposition> {
  const configSource = await resolveConfiguredRuntimeConfigSource(options);
  const { config } = configSource;
  const clock = createClock(options.now);
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const featureSelection = createConfiguredFeatureSelection(config, {
    dependencies: {
      clock,
      ...(configSource.configDirectory
        ? { configDirectory: configSource.configDirectory }
        : {}),
      env,
      fetch,
    },
  });
  const conversation = createConfiguredConversation(
    config,
    featureSelection.features,
    featureSelection.capabilityRouting.catalog,
    {
      env,
      fetch,
    },
  );
  const responseRewriter = createConfiguredResponseRewriter(config, {
    env,
    fetch,
  });

  const assistant = createAssistant({
    capabilityRouting: featureSelection.capabilityRouting,
    clock,
    config: toAssistantPolicyConfig(config, {
      enabledFeatureIds: featureSelection.features.map((feature) => feature.id),
    }),
    ...(conversation ? { conversation } : {}),
    ...(responseRewriter ? { responseRewriter } : {}),
    intentInterpreter: createConfiguredIntentInterpreter(
      config,
      featureSelection.features,
      featureSelection.capabilityRouting.catalog,
      {
        env,
        fetch,
      },
    ),
  });

  return {
    ...(featureSelection.alarmStore
      ? { alarmStore: featureSelection.alarmStore }
      : {}),
    assistant,
  };
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
