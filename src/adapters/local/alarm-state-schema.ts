import {
  isAlarmStatus,
  isCanonicalAlarmRecurrence,
  isCanonicalIsoTimestamp,
  isTerminalAlarmStatus,
  isVersionTwoAlarmStatus,
} from "../../ports/alarm-lifecycle-policy.js";
import type { AlarmRecord, AlarmStatus } from "../../ports/alarm-store.js";
import { isRecord } from "../parsing.js";
import { assertValidAlarmRecord } from "./alarm-record.js";

export interface AlarmStateDocument {
  alarms: AlarmRecord[];
  version: 3;
}

export function parseAlarmState(value: unknown): AlarmStateDocument {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !Array.isArray(value.alarms)
  ) {
    throw invalidAlarmState();
  }

  const alarms: AlarmRecord[] =
    value.version === 1
      ? value.alarms.map(migrateVersionOneAlarm)
      : value.version === 2
        ? value.alarms.map(migrateVersionTwoAlarm)
        : value.alarms.map(parseVersionThreeAlarm);
  if (new Set(alarms.map((alarm) => alarm.id)).size !== alarms.length) {
    throw invalidAlarmState();
  }

  return { alarms, version: 3 };
}

function migrateVersionOneAlarm(value: unknown): AlarmRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    !isCanonicalIsoTimestamp(value.scheduledFor)
  ) {
    throw invalidAlarmState();
  }

  return {
    createdAt: value.scheduledFor,
    deliveryAttempts: 0,
    id: value.id,
    label: value.label,
    nextDeliveryAt: value.scheduledFor,
    revision: 1,
    scheduledFor: value.scheduledFor,
    status: "scheduled",
    successfulDeliveries: 0,
    updatedAt: value.scheduledFor,
  };
}

function migrateVersionTwoAlarm(value: unknown): AlarmRecord {
  if (!isRecord(value) || "recurrence" in value || "terminalAt" in value) {
    throw invalidAlarmState();
  }
  const alarm = parseRecordFields(value, isVersionTwoAlarmStatus);
  if (!alarm) {
    throw invalidAlarmState();
  }
  const migrated: AlarmRecord = {
    ...alarm,
    ...(isTerminalAlarmStatus(alarm.status)
      ? { terminalAt: alarm.updatedAt }
      : {}),
  };
  assertValidPersistedAlarm(migrated);
  return migrated;
}

function parseVersionThreeAlarm(value: unknown): AlarmRecord {
  if (!isRecord(value)) {
    throw invalidAlarmState();
  }
  const alarm = parseRecordFields(value, isAlarmStatus);
  if (
    !alarm ||
    (value.recurrence !== undefined &&
      !isCanonicalAlarmRecurrence(value.recurrence)) ||
    (value.terminalAt !== undefined &&
      !isCanonicalIsoTimestamp(value.terminalAt))
  ) {
    throw invalidAlarmState();
  }
  const parsed: AlarmRecord = {
    ...alarm,
    ...(isCanonicalAlarmRecurrence(value.recurrence)
      ? { recurrence: { ...value.recurrence } }
      : {}),
    ...(typeof value.terminalAt === "string"
      ? { terminalAt: value.terminalAt }
      : {}),
  };
  if (
    isTerminalAlarmStatus(parsed.status) &&
    parsed.terminalAt !== parsed.updatedAt
  ) {
    throw invalidAlarmState();
  }
  assertValidPersistedAlarm(parsed);
  return parsed;
}

function parseRecordFields(
  value: Record<string, unknown>,
  isStatus: (status: unknown) => status is AlarmStatus,
): AlarmRecord | undefined {
  if (
    !isCanonicalIsoTimestamp(value.createdAt) ||
    !isNonNegativeInteger(value.deliveryAttempts) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    !isCanonicalIsoTimestamp(value.scheduledFor) ||
    !isStatus(value.status) ||
    !isNonNegativeInteger(value.successfulDeliveries) ||
    value.successfulDeliveries > value.deliveryAttempts ||
    !isCanonicalIsoTimestamp(value.updatedAt) ||
    !isPositiveInteger(value.revision) ||
    (value.nextDeliveryAt !== undefined &&
      !isCanonicalIsoTimestamp(value.nextDeliveryAt))
  ) {
    return;
  }

  return {
    createdAt: value.createdAt,
    deliveryAttempts: value.deliveryAttempts,
    id: value.id,
    label: value.label,
    ...(typeof value.nextDeliveryAt === "string"
      ? { nextDeliveryAt: value.nextDeliveryAt }
      : {}),
    revision: value.revision,
    scheduledFor: value.scheduledFor,
    status: value.status,
    successfulDeliveries: value.successfulDeliveries,
    updatedAt: value.updatedAt,
  };
}

function assertValidPersistedAlarm(alarm: AlarmRecord): void {
  try {
    assertValidAlarmRecord(alarm);
  } catch {
    throw invalidAlarmState();
  }
}

function invalidAlarmState(): Error {
  return new Error("Alarm state file is invalid.");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
