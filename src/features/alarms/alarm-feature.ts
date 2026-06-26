import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";
import type {
  FeatureArguments,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";

interface AlarmRecord {
  id: string;
  label: string;
  scheduledFor: string;
}

interface AlarmStore {
  add(alarm: AlarmRecord): void;
  list(): AlarmRecord[];
}

export function createInMemoryAlarmStore(): AlarmStore {
  const alarms: AlarmRecord[] = [];

  return {
    add: (alarm) => {
      alarms.push(alarm);
    },
    list: () => [...alarms],
  };
}

export function createAlarmFeature(store: AlarmStore): FeaturePlugin {
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
    execute: (
      command: AssistantCommand,
      args: FeatureArguments,
      context: AssistantContext,
    ) => {
      if (command.capability === "alarm.create") {
        return Promise.resolve(createAlarm(args, context, store));
      }

      return Promise.resolve(listAlarms(store));
    },
  };
}

function createAlarm(
  args: FeatureArguments,
  context: AssistantContext,
  store: AlarmStore,
): FeatureResult {
  const minutesFromNow = args.minutesFromNow as number;
  const label = typeof args.label === "string" ? args.label : "alarm";
  const scheduledFor = new Date(
    context.clock.now().getTime() + minutesFromNow * 60_000,
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
