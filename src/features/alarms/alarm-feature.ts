import type { AssistantContext } from "../../ports/assistant.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";
import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";

const alarmCreateParameters = {
  label: { type: "string" },
  minutesFromNow: { type: "number", required: true, positive: true },
} as const satisfies FeatureCapabilityParameters;

const alarmListParameters = {} as const satisfies FeatureCapabilityParameters;

type AlarmCreateArgs = FeatureArgsFromParameters<typeof alarmCreateParameters>;

export function createAlarmFeature(store: AlarmStore): FeaturePlugin {
  return defineFeature({
    id: "alarms",
    displayName: "Local Alarms",
    capabilities: {
      "alarm.create": defineCapability({
        risk: "high",
        requiresConfirmation: true,
        parameters: alarmCreateParameters,
        execute: (request, context: AssistantContext) =>
          createAlarm(request.args, context, store),
      }),
      "alarm.list": defineCapability({
        risk: "low",
        parameters: alarmListParameters,
        execute: () => listAlarms(store),
      }),
    },
  });
}

function createAlarm(
  args: AlarmCreateArgs,
  context: AssistantContext,
  store: AlarmStore,
): FeatureResult {
  const label = args.label ?? "alarm";
  const scheduledFor = new Date(
    context.clock.now().getTime() + args.minutesFromNow * 60_000,
  ).toISOString();
  const alarm: AlarmRecord = {
    id: `alarm-${store.list().length + 1}`,
    label,
    scheduledFor,
  };

  store.add(alarm);

  return {
    text: `Alarm set for ${scheduledFor} (${label}).`,
    data: {
      id: alarm.id,
      label: alarm.label,
      scheduledFor: alarm.scheduledFor,
    },
  };
}

function listAlarms(store: AlarmStore): FeatureResult {
  const alarms = store.list();

  if (alarms.length === 0) {
    return {
      text: "There are no alarms set.",
    };
  }

  return {
    text: `Alarms: ${alarms
      .map((alarm) => `${alarm.id} at ${alarm.scheduledFor} (${alarm.label})`)
      .join("; ")}.`,
  };
}
