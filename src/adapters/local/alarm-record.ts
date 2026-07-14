import type {
  AlarmLifecycleUpdate,
  AlarmRecord,
  NewAlarmRecord,
} from "../../ports/alarm-store.js";

export function createScheduledAlarm(
  alarm: NewAlarmRecord,
  id: string,
  now: Date,
): AlarmRecord {
  const timestamp = now.toISOString();

  const stored: AlarmRecord = {
    ...alarm,
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
  if (isTerminalStatus(updated.status)) {
    updated.terminalAt = alarm.terminalAt ?? update.updatedAt;
  } else {
    delete updated.terminalAt;
  }

  assertValidLifecycleUpdate(alarm, updated);

  return updated;
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
      !isValidAlarmRecurrence(alarm.recurrence)) ||
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
  const editsAllowed =
    updated.label === previous.label &&
    updated.scheduledFor === previous.scheduledFor;

  if (
    !statusAllowed ||
    attemptsAdded < 0 ||
    attemptsAdded > 1 ||
    successesAdded < 0 ||
    successesAdded > 1 ||
    !editsAllowed ||
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
  ringing: ["ringing", "completed", "dismissed", "missed"],
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
        alarm.terminalAt !== undefined
      );
    case "completed":
      return (
        alarm.deliveryAttempts >= 1 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt !== undefined
      );
    case "dismissed":
      return (
        alarm.deliveryAttempts >= 1 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt !== undefined
      );
    case "missed":
      return (
        alarm.successfulDeliveries === 0 &&
        alarm.nextDeliveryAt === undefined &&
        alarm.terminalAt !== undefined
      );
  }
}

function isTerminalStatus(status: AlarmRecord["status"]): boolean {
  return (
    status === "cancelled" ||
    status === "completed" ||
    status === "dismissed" ||
    status === "missed"
  );
}

function isValidAlarmRecurrence(
  recurrence: NonNullable<AlarmRecord["recurrence"]>,
): boolean {
  if (recurrence.frequency !== "daily" && recurrence.frequency !== "weekly") {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: recurrence.timeZone });
    return recurrence.timeZone.length > 0;
  } catch {
    return false;
  }
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}
