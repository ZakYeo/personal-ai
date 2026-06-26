import { createAssistant } from "../core/assistant/index.js";
import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { Assistant } from "../core/assistant/index.js";
import type { AssistantConfig, ClockPort } from "../ports/assistant.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { IntentInterpreterPort } from "../ports/intent.js";
import { loadConfig } from "./config/config.js";

interface DeterministicRuntimeOptions {
  config?: AssistantConfig;
  configPath?: string;
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

  return createAssistant({
    clock,
    config,
    features: createConfiguredFeatures(config),
    intentInterpreter: createIntentInterpreter(config),
  });
}

function createIntentInterpreter(
  config: AssistantConfig,
): IntentInterpreterPort {
  if (config.intent.provider === "deterministic") {
    return new DeterministicIntentInterpreter();
  }

  throw new Error(
    `Config intent.provider "${config.intent.provider}" is not registered.`,
  );
}

function createConfiguredFeatures(config: AssistantConfig): FeaturePlugin[] {
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
