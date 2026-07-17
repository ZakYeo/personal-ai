export interface LocalDateTimeParts {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

export function resolveLocalDateTime(
  parts: LocalDateTimeParts,
  timeZone: string,
): Date {
  const targetTimestamp = localTimestamp(parts);
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
  if (exact) return exact.instant;

  const shiftedForward = candidates
    .filter(({ renderedTimestamp }) => renderedTimestamp > targetTimestamp)
    .sort(
      (left, right) =>
        left.renderedTimestamp - right.renderedTimestamp ||
        left.instant.getTime() - right.instant.getTime(),
    )[0];
  if (!shiftedForward) {
    throw new Error("Local date and time could not be resolved.");
  }
  return shiftedForward.instant;
}

export function zonedParts(date: Date, timeZone: string): LocalDateTimeParts {
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

export function localTimestamp(parts: LocalDateTimeParts): number {
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
