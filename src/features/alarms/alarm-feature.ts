import type { AssistantContext } from "../../ports/assistant.js";
import type {
  FeatureExecutionRequest,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";

type AlarmCreateRequest = FeatureExecutionRequest<
  "alarm.create",
  {
    label?: string;
    minutesFromNow: number;
  }
>;
type AlarmListRequest = FeatureExecutionRequest<
  "alarm.list",
  Record<string, never>
>;
type AlarmExecutionRequest = AlarmCreateRequest | AlarmListRequest;

export function createAlarmFeature(
  store: AlarmStore,
): FeaturePlugin<AlarmExecutionRequest> {
  return {
    id: "alarms",
    displayName: "Local Alarms",
    capabilities: [
      {
        name: "alarm.create",
        risk: "high",
        requiresConfirmation: false,
        parameters: {
          label: { type: "string" },
          minutesFromNow: { type: "number", required: true, positive: true },
        },
      },
      { name: "alarm.list", risk: "low", parameters: {} },
    ],
    execute: (request, context: AssistantContext) => {
      if (request.capability === "alarm.create") {
        return Promise.resolve(createAlarm(request.args, context, store));
      }

      return Promise.resolve(listAlarms(store));
    },
  };
}

function createAlarm(
  args: AlarmCreateRequest["args"],
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
