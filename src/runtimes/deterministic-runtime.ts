import { createAssistant } from "../core/assistant/index.js";
import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { Assistant } from "../core/assistant/index.js";
import type { ClockPort } from "../ports/assistant.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import {
  loadConfig,
  toAssistantPolicyConfig,
  type LoadedRuntimeConfig,
} from "./config/config.js";

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
    intentInterpreter: createIntentInterpreter(config, features, {
      env: options.env ?? process.env,
      fetch: options.fetch ?? globalThis.fetch,
    }),
  });
}

interface IntentInterpreterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

function createIntentInterpreter(
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

function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
): FeaturePlugin[] {
  const alarmStore = createInMemoryAlarmStore();
  const featureFactories: Record<string, () => FeaturePlugin> = {
    "alarms:local": () => createAlarmFeature(alarmStore),
    "calendar:mock": createCalendarFeature,
    "messaging:mock": createMessagingFeature,
  };

  return Object.entries(config.features)
    .filter(([, featureConfig]) => featureConfig.enabled)
    .map(([featureId, featureConfig]) => {
      if (!featureConfig.adapter) {
        throw new Error(
          `Config feature "${featureId}".adapter must be set for enabled features.`,
        );
      }

      const factory = featureFactories[`${featureId}:${featureConfig.adapter}`];

      if (!factory) {
        throw new Error(
          `Config feature "${featureId}" adapter "${featureConfig.adapter}" is not registered.`,
        );
      }

      return factory();
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
