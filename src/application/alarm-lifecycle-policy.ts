import type {
  AlarmRecord,
  AlarmRecurrence,
  AlarmStatus,
} from "../ports/alarm-store.js";
import {
  isCanonicalTimeZoneIdentifier,
  resolveTimeZoneIdentifier,
} from "./temporal-policy.js";

export { isCanonicalIsoTimestamp } from "./temporal-policy.js";

export function resolveAlarmRecurrence(
  frequency: unknown,
  timeZone: unknown,
): AlarmRecurrence {
  if (frequency !== "daily" && frequency !== "weekly") {
    throw new Error("Alarm recurrence frequency must be daily or weekly.");
  }
  if (timeZone === undefined) {
    throw new Error("Alarm recurrence requires an explicit IANA timezone.");
  }
  if (typeof timeZone !== "string" || timeZone.length === 0) {
    throw new Error("Alarm recurrence requires a valid IANA timezone.");
  }

  const resolvedTimeZone = resolveTimeZoneIdentifier(timeZone);
  if (resolvedTimeZone === undefined) {
    throw new Error("Alarm recurrence requires a valid IANA timezone.");
  }
  return { frequency, timeZone: resolvedTimeZone };
}

export function isCanonicalAlarmRecurrence(
  value: unknown,
): value is AlarmRecurrence {
  if (
    typeof value !== "object" ||
    value === null ||
    !("frequency" in value) ||
    !("timeZone" in value)
  ) {
    return false;
  }

  return (
    (value.frequency === "daily" || value.frequency === "weekly") &&
    isCanonicalTimeZoneIdentifier(value.timeZone)
  );
}

export function isAlarmStatus(value: unknown): value is AlarmStatus {
  return (
    value === "scheduled" ||
    value === "snoozed" ||
    value === "ringing" ||
    value === "completed" ||
    value === "dismissed" ||
    value === "cancelled" ||
    value === "missed"
  );
}

export function isVersionTwoAlarmStatus(
  value: unknown,
): value is Exclude<AlarmStatus, "snoozed"> {
  return isAlarmStatus(value) && value !== "snoozed";
}

export function isTerminalAlarmStatus(status: AlarmRecord["status"]): boolean {
  return (
    status === "cancelled" ||
    status === "completed" ||
    status === "dismissed" ||
    status === "missed"
  );
}
