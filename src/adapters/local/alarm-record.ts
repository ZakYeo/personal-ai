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

  return {
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

  assertValidLifecycleUpdate(updated);

  return updated;
}

function assertValidLifecycleUpdate(alarm: AlarmRecord): void {
  if (
    !isCanonicalIsoTimestamp(alarm.updatedAt) ||
    (alarm.nextDeliveryAt !== undefined &&
      !isCanonicalIsoTimestamp(alarm.nextDeliveryAt)) ||
    !Number.isInteger(alarm.deliveryAttempts) ||
    alarm.deliveryAttempts < 0 ||
    !Number.isInteger(alarm.successfulDeliveries) ||
    alarm.successfulDeliveries < 0 ||
    alarm.successfulDeliveries > alarm.deliveryAttempts
  ) {
    throw new Error("Alarm lifecycle update is invalid.");
  }
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}
