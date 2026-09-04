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
import { resolveConfiguredRuntimeConfigSource } from "./config/runtime-config-source.js";
import type { RuntimeConfigSource } from "./config/runtime-config-source.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";
import type { RuntimeBackgroundTask } from "./background-task.js";
import { assistantPersonalizationReaderService } from "./profile-runtime-services.js";
import type { RuntimeServiceRegistry } from "./runtime-service-registry.js";

export interface ConfiguredTextRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configDirectory?: string;
  configPath?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  featureAdapterRegistry?: FeatureAdapterRegistry;
  now?: () => Date;
  notificationDelivery?: NotificationDeliveryPort;
}

export async function createConfiguredTextRuntime(
  options: ConfiguredTextRuntimeOptions = {},
): Promise<Assistant> {
  return (await createConfiguredTextRuntimeComposition(options)).assistant;
}

interface ConfiguredTextRuntimeComposition {
  assistant: Assistant;
  backgroundTasks: RuntimeBackgroundTask[];
  services: RuntimeServiceRegistry;
}

export async function createConfiguredTextRuntimeComposition(
  options: ConfiguredTextRuntimeOptions = {},
): Promise<ConfiguredTextRuntimeComposition> {
  const configSource = await resolveConfiguredRuntimeConfigSource(options);
  return createConfiguredTextRuntimeCompositionFromResolvedSource(
    configSource,
    options,
  );
}

export function createConfiguredTextRuntimeCompositionFromResolvedSource(
  configSource: RuntimeConfigSource,
  options: Pick<ConfiguredTextRuntimeOptions, "env" | "fetch" | "now"> = {},
): ConfiguredTextRuntimeComposition {
  const { config } = configSource;
  const clock = createClock(options.now);
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const featureSelection = createConfiguredFeatureSelection(config, {
    runtime: { clock },
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
  const personalizationReader = featureSelection.services.get(
    assistantPersonalizationReaderService,
  );

  const assistant = createAssistant({
    capabilityRouting: featureSelection.capabilityRouting,
    clock,
    config: toAssistantPolicyConfig(config, {
      enabledFeatureIds: featureSelection.features.map((feature) => feature.id),
    }),
    ...(personalizationReader ? { personalizationReader } : {}),
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
    assistant,
    backgroundTasks: featureSelection.backgroundTasks,
    services: featureSelection.services,
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
