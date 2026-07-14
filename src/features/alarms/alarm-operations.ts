import type { AssistantContext } from "../../ports/assistant.js";
import type { FeatureResult } from "../../ports/feature.js";
import type {
  AlarmLifecycleUpdate,
  AlarmRecord,
  AlarmStatus,
  AlarmStore,
} from "../../ports/alarm-store.js";
import type {
  AlarmCreateArgs,
  AlarmDelayTargetArgs,
  AlarmEditArgs,
  AlarmTargetArgs,
} from "./alarm-feature-contract.js";

export async function createAlarm(
  args: AlarmCreateArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  const label = args.label ?? "alarm";
  const scheduledFor = relativeTime(context, args.minutesFromNow);
  const recurrence = parseRecurrence(args);
  const alarm = await store.add({
    label,
    ...(recurrence ? { recurrence } : {}),
    scheduledFor,
  });

  if (alarm.recurrence) {
    const frequencyLabel =
      alarm.recurrence.frequency === "daily" ? "Daily" : "Weekly";
    return {
      text: `${frequencyLabel} alarm set for ${scheduledFor} (${label}) in ${alarm.recurrence.timeZone}.`,
      data: {
        id: alarm.id,
        label: alarm.label,
        recurrenceFrequency: alarm.recurrence.frequency,
        recurrenceTimeZone: alarm.recurrence.timeZone,
        scheduledFor: alarm.scheduledFor,
      },
    };
  }

  return {
    text: `Alarm set for ${scheduledFor} (${label}).`,
    data: {
      id: alarm.id,
      label: alarm.label,
      scheduledFor: alarm.scheduledFor,
    },
  };
}

function parseRecurrence(
  args: AlarmCreateArgs,
): AlarmRecord["recurrence"] | undefined {
  const frequency = args.recurrenceFrequency;
  const timeZone = args.recurrenceTimeZone;
  if (frequency === undefined && timeZone === undefined) {
    return;
  }
  if (frequency !== "daily" && frequency !== "weekly") {
    throw new Error("Alarm recurrence frequency must be daily or weekly.");
  }
  if (timeZone === undefined) {
    throw new Error("Alarm recurrence requires an explicit IANA timezone.");
  }
  let canonicalTimeZone: string;
  try {
    canonicalTimeZone = new Intl.DateTimeFormat("en", {
      timeZone,
    }).resolvedOptions().timeZone;
  } catch {
    throw new Error("Alarm recurrence requires a valid IANA timezone.");
  }
  return { frequency, timeZone: canonicalTimeZone };
}

export async function listAlarms(store: AlarmStore): Promise<FeatureResult> {
  const alarms = await store.list();
  if (alarms.length === 0) {
    return { text: "There are no alarms set." };
  }

  const projections = alarms.map(projectAlarmStatus);
  return {
    data: Object.fromEntries(
      projections.flatMap(({ facts }, index) =>
        Object.entries(facts).map(([name, value]) => [
          `alarm${index}${name}`,
          value,
        ]),
      ),
    ),
    text: projections.map(({ text }) => text).join(" "),
  };
}

export function acknowledgeAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  return transitionAlarm(args, context, store, ["ringing"], "completed", {
    verb: "Acknowledged",
  });
}

export function dismissAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  return transitionAlarm(args, context, store, ["ringing"], "dismissed", {
    verb: "Dismissed",
  });
}

export function cancelAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  return transitionAlarm(
    args,
    context,
    store,
    ["scheduled", "snoozed"],
    "cancelled",
    { verb: "Cancelled" },
  );
}

export function snoozeAlarm(
  args: AlarmDelayTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  const nextDeliveryAt = relativeTime(context, args.minutesFromNow);
  return updateSelectedAlarm(args, context, store, ["ringing"], () => ({
    changes: {
      deliveryAttempts: 0,
      nextDeliveryAt,
      status: "snoozed",
      successfulDeliveries: 0,
    },
    result: (alarm) => ({
      data: {
        id: alarm.id,
        label: alarm.label,
        nextDeliveryAt,
        status: alarm.status,
      },
      text: `Snoozed the ${alarm.label} alarm until ${nextDeliveryAt}.`,
    }),
  }));
}

export function rescheduleAlarm(
  args: AlarmDelayTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  const scheduledFor = relativeTime(context, args.minutesFromNow);
  return updateSelectedAlarm(
    args,
    context,
    store,
    ["scheduled", "snoozed"],
    () => ({
      changes: {
        deliveryAttempts: 0,
        nextDeliveryAt: scheduledFor,
        scheduledFor,
        status: "scheduled",
        successfulDeliveries: 0,
      },
      result: (alarm) => ({
        data: {
          id: alarm.id,
          label: alarm.label,
          scheduledFor: alarm.scheduledFor,
          status: alarm.status,
        },
        text: `Rescheduled the ${alarm.label} alarm for ${scheduledFor}.`,
      }),
    }),
  );
}

export function editAlarm(
  args: AlarmEditArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  return updateSelectedAlarm(
    args,
    context,
    store,
    ["scheduled", "snoozed"],
    (current) => ({
      changes: { label: args.newLabel },
      result: (alarm) => ({
        data: { id: alarm.id, label: alarm.label, status: alarm.status },
        text: `Renamed the ${current.label} alarm to ${alarm.label}.`,
      }),
    }),
  );
}

function transitionAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
  allowedStatuses: readonly AlarmStatus[],
  nextStatus: AlarmStatus,
  response: { verb: string },
): Promise<FeatureResult> {
  return updateSelectedAlarm(args, context, store, allowedStatuses, () => ({
    changes: { nextDeliveryAt: null, status: nextStatus },
    result: (alarm) => ({
      data: {
        id: alarm.id,
        label: alarm.label,
        ...(alarm.status === "scheduled" && alarm.recurrence
          ? { scheduledFor: alarm.scheduledFor }
          : {}),
        status: alarm.status,
      },
      text:
        alarm.status === "scheduled" && alarm.recurrence
          ? `${response.verb} the ${alarm.label} alarm. Its next occurrence is ${alarm.scheduledFor}.`
          : `${response.verb} the ${alarm.label} alarm.`,
    }),
  }));
}

interface AlarmMutation {
  changes: AlarmLifecycleUpdate["changes"];
  result(alarm: AlarmRecord): FeatureResult;
}

async function updateSelectedAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
  allowedStatuses: readonly AlarmStatus[],
  mutation: (current: AlarmRecord) => AlarmMutation,
): Promise<FeatureResult> {
  const initialSelection = selectAlarm(
    await store.list(),
    args,
    allowedStatuses,
  );
  if (initialSelection.kind === "response") {
    return { text: initialSelection.text };
  }
  const selectedId = initialSelection.alarm.id;
  let current = initialSelection.alarm;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selectedMutation = mutation(current);
    const updated = await store.update({
      changes: selectedMutation.changes,
      expectedRevision: current.revision,
      id: current.id,
      updatedAt: context.clock.now().toISOString(),
    });
    if (updated) {
      return selectedMutation.result(updated);
    }
    if (attempt === 2) {
      break;
    }

    const refreshed = selectAlarm(
      await store.list(),
      { id: selectedId },
      allowedStatuses,
    );
    if (refreshed.kind === "response") {
      return { text: refreshed.text };
    }
    current = refreshed.alarm;
  }

  throw new Error("Alarm changed repeatedly during lifecycle update.");
}

type AlarmSelection =
  | { alarm: AlarmRecord; kind: "alarm" }
  | { kind: "response"; text: string };

function selectAlarm(
  alarms: readonly AlarmRecord[],
  args: AlarmTargetArgs,
  allowedStatuses: readonly AlarmStatus[],
): AlarmSelection {
  const target = args.id ?? args.label ?? allowedStatuses.join(" or ");
  const candidates = args.id
    ? alarms.filter((alarm) => alarm.id === args.id)
    : args.label
      ? alarms.filter(
          (alarm) => alarm.label.toLowerCase() === args.label?.toLowerCase(),
        )
      : alarms;
  const matches = candidates.filter((alarm) =>
    allowedStatuses.includes(alarm.status),
  );

  if (candidates.length === 0) {
    return { kind: "response", text: `I could not find the ${target} alarm.` };
  }
  if (matches.length > 1) {
    return {
      kind: "response",
      text: `More than one alarm is labelled ${target}. Please use its ID.`,
    };
  }
  const alarm = matches[0];
  if (!alarm) {
    const ineligible = candidates[0]!;
    return {
      kind: "response",
      text: `The ${ineligible.label} alarm cannot be changed while it is ${ineligible.status}.`,
    };
  }
  return { alarm, kind: "alarm" };
}

function relativeTime(
  context: AssistantContext,
  minutesFromNow: number,
): string {
  return new Date(
    context.clock.now().getTime() + minutesFromNow * 60_000,
  ).toISOString();
}

function projectAlarmStatus(alarm: AlarmRecord): {
  facts: Record<string, string>;
  text: string;
} {
  const identity = `The ${alarm.label} alarm (${alarm.id})`;
  const facts: Record<string, string> = {
    Id: alarm.id,
    Label: alarm.label,
    ScheduledFor: alarm.scheduledFor,
    Status: alarm.status,
  };
  switch (alarm.status) {
    case "scheduled":
      return {
        facts: {
          ...facts,
          ...(alarm.recurrence
            ? {
                RecurrenceFrequency: alarm.recurrence.frequency,
                RecurrenceTimeZone: alarm.recurrence.timeZone,
              }
            : {}),
        },
        text: alarm.recurrence
          ? `${identity} is scheduled for ${alarm.scheduledFor} and repeats ${alarm.recurrence.frequency} in ${alarm.recurrence.timeZone}.`
          : `${identity} is scheduled for ${alarm.scheduledFor}.`,
      };
    case "snoozed":
      return {
        facts: { ...facts, NextDeliveryAt: alarm.nextDeliveryAt! },
        text: `${identity} is snoozed until ${alarm.nextDeliveryAt}.`,
      };
    case "ringing":
      return { facts, text: `${identity} is ringing.` };
    case "completed":
      return {
        facts: { ...facts, TerminalAt: alarm.terminalAt! },
        text: `${identity} was completed at ${alarm.terminalAt}.`,
      };
    case "dismissed":
      return {
        facts: { ...facts, TerminalAt: alarm.terminalAt! },
        text: `${identity} was dismissed at ${alarm.terminalAt}.`,
      };
    case "cancelled":
      return {
        facts: { ...facts, TerminalAt: alarm.terminalAt! },
        text: `${identity} was cancelled at ${alarm.terminalAt}.`,
      };
    case "missed":
      return {
        facts: { ...facts, TerminalAt: alarm.terminalAt! },
        text: `${identity} was missed at ${alarm.terminalAt}.`,
      };
  }
}
