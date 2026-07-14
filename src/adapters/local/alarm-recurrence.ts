import type { AlarmRecurrence } from "../../ports/alarm-store.js";

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

interface ZonedParts {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB-u-ca-iso8601", {
      day: "2-digit",
      fractionalSecondDigits: 3,
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    day: values.day!,
    hour: values.hour!,
    millisecond: values.fractionalSecond!,
    minute: values.minute!,
    month: values.month!,
    second: values.second!,
    year: values.year!,
  };
}

function localTimestamp(parts: ZonedParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function addZonedDays(
  scheduledLocal: ZonedParts,
  days: number,
  timeZone: string,
): Date {
  const targetDate = new Date(
    localTimestamp(scheduledLocal) + days * 86_400_000,
  );
  const target: ZonedParts = {
    day: targetDate.getUTCDate(),
    hour: scheduledLocal.hour,
    millisecond: scheduledLocal.millisecond,
    minute: scheduledLocal.minute,
    month: targetDate.getUTCMonth() + 1,
    second: scheduledLocal.second,
    year: targetDate.getUTCFullYear(),
  };
  const targetTimestamp = localTimestamp(target);
  const offsets = new Set(
    [-48, 0, 48].map((hours) => {
      const instant = new Date(targetTimestamp + hours * 3_600_000);
      return localTimestamp(zonedParts(instant, timeZone)) - instant.getTime();
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(targetTimestamp - offset))
    .map((instant) => ({
      instant,
      renderedTimestamp: localTimestamp(zonedParts(instant, timeZone)),
    }));
  const exact = candidates
    .filter(({ renderedTimestamp }) => renderedTimestamp === targetTimestamp)
    .sort((left, right) => left.instant.getTime() - right.instant.getTime())[0];
  if (exact) {
    return exact.instant;
  }

  const shiftedForward = candidates
    .filter(({ renderedTimestamp }) => renderedTimestamp > targetTimestamp)
    .sort(
      (left, right) =>
        left.renderedTimestamp - right.renderedTimestamp ||
        left.instant.getTime() - right.instant.getTime(),
    )[0];
  if (!shiftedForward) {
    throw new Error("Alarm recurrence could not be resolved.");
  }
  return shiftedForward.instant;
}
