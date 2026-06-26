import { createAssistant } from "../core/assistant/index.js";
import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import {
  createAlarmFeature,
  createInMemoryAlarmStore,
} from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { Assistant } from "../core/assistant/index.js";
import type { AssistantConfig, ClockPort } from "../ports/assistant.js";
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
  const alarmStore = createInMemoryAlarmStore();

  return createAssistant({
    clock,
    config,
    features: [
      createCalendarFeature(),
      createMessagingFeature(),
      createAlarmFeature(alarmStore),
    ],
    intentInterpreter: new DeterministicIntentInterpreter(),
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
