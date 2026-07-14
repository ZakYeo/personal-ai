import type {
  AlarmRecord,
  AlarmRecurrence,
  AlarmStatus,
} from "./alarm-store.js";

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

  try {
    return {
      frequency,
      timeZone: new Intl.DateTimeFormat("en", {
        timeZone,
      }).resolvedOptions().timeZone,
    };
  } catch {
    throw new Error("Alarm recurrence requires a valid IANA timezone.");
  }
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

  try {
    const recurrence = resolveAlarmRecurrence(value.frequency, value.timeZone);
    return (
      recurrence.frequency === value.frequency &&
      recurrence.timeZone === value.timeZone
    );
  } catch {
    return false;
  }
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

export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}
