import type { AlarmRecurrence } from "../../ports/alarm-store.js";
import {
  localTimestamp,
  resolveLocalDateTime,
  zonedParts,
  type LocalDateTimeParts,
} from "../../ports/local-date-time.js";

export function nextRecurringOccurrence(
  scheduledFor: string,
  after: string,
  recurrence: AlarmRecurrence,
): string {
  const scheduledLocal = zonedParts(
    new Date(scheduledFor),
    recurrence.timeZone,
  );
  const afterLocal = zonedParts(new Date(after), recurrence.timeZone);
  const intervalDays = recurrence.frequency === "daily" ? 1 : 7;
  const elapsedLocalDays = Math.floor(
    (localTimestamp(afterLocal) - localTimestamp(scheduledLocal)) / 86_400_000,
  );
  let intervals = Math.max(1, Math.floor(elapsedLocalDays / intervalDays));
  let next = addZonedDays(
    scheduledLocal,
    intervals * intervalDays,
    recurrence.timeZone,
  );

  while (next.getTime() <= new Date(after).getTime()) {
    intervals += 1;
    next = addZonedDays(
      scheduledLocal,
      intervals * intervalDays,
      recurrence.timeZone,
    );
  }

  return next.toISOString();
}

function addZonedDays(
  scheduledLocal: LocalDateTimeParts,
  days: number,
  timeZone: string,
): Date {
  const targetDate = new Date(
    localTimestamp(scheduledLocal) + days * 86_400_000,
  );
  const target: LocalDateTimeParts = {
    day: targetDate.getUTCDate(),
    hour: scheduledLocal.hour,
    millisecond: scheduledLocal.millisecond,
    minute: scheduledLocal.minute,
    month: targetDate.getUTCMonth() + 1,
    second: scheduledLocal.second,
    year: targetDate.getUTCFullYear(),
  };
  return resolveLocalDateTime(target, timeZone);
}
