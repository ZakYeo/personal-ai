import type {
  AlarmLifecycleUpdate,
  AlarmRecord,
  AlarmRecurrence,
  NewAlarmRecord,
} from "../../ports/alarm-store.js";
import {
  isCanonicalAlarmRecurrence,
  isCanonicalIsoTimestamp,
  isTerminalAlarmStatus,
  resolveAlarmRecurrence,
} from "../../ports/alarm-lifecycle-policy.js";
import { nextRecurringOccurrence } from "./alarm-recurrence.js";

export function createScheduledAlarm(
  alarm: NewAlarmRecord,
  id: string,
  now: Date,
): AlarmRecord {
  const timestamp = now.toISOString();
  const recurrence = alarm.recurrence
    ? resolveAlarmRecurrence(
        alarm.recurrence.frequency,
        alarm.recurrence.timeZone,
      )
    : undefined;

  const stored: AlarmRecord = {
    ...alarm,
    ...(recurrence ? { recurrence } : {}),
    createdAt: timestamp,
    deliveryAttempts: 0,
    id,
    nextDeliveryAt: alarm.scheduledFor,
    revision: 1,
    status: "scheduled",
    successfulDeliveries: 0,
    updatedAt: timestamp,
  };

  assertValidAlarmRecord(stored);
  return stored;
}

export function cloneAlarmRecord(alarm: AlarmRecord): AlarmRecord {
  return {
    ...alarm,
    ...(alarm.recurrence ? { recurrence: { ...alarm.recurrence } } : {}),
  };
}

export function applyAlarmLifecycleUpdate(
  alarm: AlarmRecord,
  update: AlarmLifecycleUpdate,
): AlarmRecord | undefined {
  if (alarm.id !== update.id || alarm.revision !== update.expectedRevision) {
    return;
  }

  const nextDeliveryAt =
    update.changes.nextDeliveryAt === null
      ? undefined
      : (update.changes.nextDeliveryAt ?? alarm.nextDeliveryAt);
  const updated: AlarmRecord = {
    ...alarm,
    ...(update.changes.deliveryAttempts === undefined
      ? {}
      : { deliveryAttempts: update.changes.deliveryAttempts }),
    ...(update.changes.label === undefined
      ? {}
      : { label: update.changes.label }),
    ...(update.changes.scheduledFor === undefined
      ? {}
      : { scheduledFor: update.changes.scheduledFor }),
    ...(update.changes.status === undefined
      ? {}
      : { status: update.changes.status }),
    ...(update.changes.successfulDeliveries === undefined
      ? {}
      : { successfulDeliveries: update.changes.successfulDeliveries }),
    revision: alarm.revision + 1,
    updatedAt: update.updatedAt,
    ...(nextDeliveryAt ? { nextDeliveryAt } : {}),
  };

  if (update.changes.nextDeliveryAt === null) {
    delete updated.nextDeliveryAt;
  }
  if (isTerminalAlarmStatus(updated.status)) {
    updated.terminalAt = alarm.terminalAt ?? update.updatedAt;
  } else {
    delete updated.terminalAt;
  }

  return applyValidatedTransition(alarm, updated).record;
}

type AppliedAlarmTransition =
  | { kind: "recurrence_advanced"; record: AlarmRecord }
  | { kind: "updated"; record: AlarmRecord };

function applyValidatedTransition(
  previous: AlarmRecord,
  requested: AlarmRecord,
): AppliedAlarmTransition {
  assertValidLifecycleUpdate(previous, requested);
  const recurrence = recurrenceToAdvance(previous, requested.status);
  if (!recurrence) {
    return { kind: "updated", record: requested };
  }

  const scheduledFor = nextRecurringOccurrence(
    previous.scheduledFor,
    requested.updatedAt,
    recurrence,
  );
  const advanced: AlarmRecord = {
    ...requested,
    deliveryAttempts: 0,
    nextDeliveryAt: scheduledFor,
    scheduledFor,
    status: "scheduled",
    successfulDeliveries: 0,
  };
  delete advanced.terminalAt;
  assertValidRecurringAdvance(previous, advanced);
  return { kind: "recurrence_advanced", record: advanced };
}

function recurrenceToAdvance(
  previous: AlarmRecord,
  requestedStatus: AlarmRecord["status"],
): AlarmRecurrence | undefined {
  return requestedStatus === "completed" ||
    requestedStatus === "dismissed" ||
    requestedStatus === "missed"
    ? previous.recurrence
    : undefined;
}

function assertValidRecurringAdvance(
  previous: AlarmRecord,
  advanced: AlarmRecord,
): void {
  assertValidAlarmRecord(advanced);
  if (
    advanced.recurrence?.frequency !== previous.recurrence?.frequency ||
    advanced.recurrence?.timeZone !== previous.recurrence?.timeZone ||
    advanced.scheduledFor <= previous.scheduledFor ||
    advanced.scheduledFor <= advanced.updatedAt
  ) {
    throw new Error("Alarm lifecycle update is invalid.");
  }
}

export function assertValidAlarmRecord(alarm: AlarmRecord): void {
  if (
    alarm.id.length === 0 ||
    alarm.label.length === 0 ||
    !isCanonicalIsoTimestamp(alarm.createdAt) ||
    !isCanonicalIsoTimestamp(alarm.scheduledFor) ||
    !isCanonicalIsoTimestamp(alarm.updatedAt) ||
    (alarm.nextDeliveryAt !== undefined &&
      !isCanonicalIsoTimestamp(alarm.nextDeliveryAt)) ||
    !Number.isInteger(alarm.deliveryAttempts) ||
    alarm.deliveryAttempts < 0 ||
    alarm.deliveryAttempts > 2 ||
    !Number.isInteger(alarm.successfulDeliveries) ||
    alarm.successfulDeliveries < 0 ||
    alarm.successfulDeliveries > alarm.deliveryAttempts ||
    (alarm.recurrence !== undefined &&
      !isCanonicalAlarmRecurrence(alarm.recurrence)) ||
    !hasConsistentStatusFields(alarm)
  ) {
    throw new Error("Alarm lifecycle update is invalid.");
  }
}

function assertValidLifecycleUpdate(
  previous: AlarmRecord,
  updated: AlarmRecord,
): void {
  assertValidAlarmRecord(updated);

  const attemptsAdded = updated.deliveryAttempts - previous.deliveryAttempts;
  const successesAdded =
    updated.successfulDeliveries - previous.successfulDeliveries;
  const statusAllowed = allowedNextStatuses[previous.status].includes(
    updated.status,
  );
  const snoozing =
    previous.status === "ringing" && updated.status === "snoozed";
  const labelChanged = updated.label !== previous.label;
  const scheduleChanged = updated.scheduledFor !== previous.scheduledFor;
  const labelEditAllowed =
    !labelChanged ||
    ((previous.status === "scheduled" || previous.status === "snoozed") &&
      updated.status === previous.status);
  const scheduleEditAllowed =
    !scheduleChanged ||
    ((previous.status === "scheduled" || previous.status === "snoozed") &&
      updated.status === "scheduled");
  const countersAllowed = snoozing
    ? updated.deliveryAttempts === 0 && updated.successfulDeliveries === 0
    : attemptsAdded >= 0 &&
      attemptsAdded <= 1 &&
      successesAdded >= 0 &&
      successesAdded <= 1;

  if (
    !statusAllowed ||
    !countersAllowed ||
    !labelEditAllowed ||
    !scheduleEditAllowed ||
    updated.updatedAt < previous.updatedAt ||
    (previous.status === "scheduled" &&
      updated.status === "ringing" &&
      attemptsAdded !== 1) ||
    (previous.status === "ringing" &&
      updated.status === "ringing" &&
      attemptsAdded === 1 &&
      successesAdded !== 0)
  ) {
    throw new Error("Alarm lifecycle update is invalid.");
  }
}

const allowedNextStatuses: Record<
  AlarmRecord["status"],
  AlarmRecord["status"][]
> = {
  cancelled: [],
  completed: [],
  dismissed: [],
  missed: [],
  ringing: ["ringing", "snoozed", "completed", "dismissed", "missed"],
  scheduled: ["scheduled", "ringing", "cancelled", "missed"],
  snoozed: ["scheduled", "ringing", "cancelled", "missed"],
};

function hasConsistentStatusFields(alarm: AlarmRecord): boolean {
  switch (alarm.status) {
    case "scheduled":
    case "snoozed":
      return (
        alarm.deliveryAttempts === 0 &&
        alarm.successfulDeliveries === 0 &&
        alarm.nextDeliveryAt !== undefined &&
        alarm.terminalAt === undefined
      );
    case "ringing":
      return (
        alarm.deliveryAttempts >= 1 &&
        (alarm.deliveryAttempts === 1) ===
          (alarm.nextDeliveryAt !== undefined) &&
        alarm.terminalAt === undefined
      );
    case "cancelled":
      return (
        alarm.deliveryAttempts === 0 &&
        alarm.successfulDeliveries === 0 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt === alarm.updatedAt
      );
    case "completed":
      return (
        alarm.deliveryAttempts >= 1 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt === alarm.updatedAt
      );
    case "dismissed":
      return (
        alarm.deliveryAttempts >= 1 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt === alarm.updatedAt
      );
    case "missed":
      return (
        alarm.successfulDeliveries === 0 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt === alarm.updatedAt
      );
  }
}
