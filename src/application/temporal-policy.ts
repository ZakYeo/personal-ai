export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

export function isCanonicalIsoDate(value: unknown): value is string {
  return parseCanonicalIsoDate(value) !== undefined;
}

export function parseCanonicalIsoDate(
  value: unknown,
): { day: number; month: number; year: number } | undefined {
  if (typeof value !== "string") return;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) return;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const timestamp = new Date(Date.UTC(year, month - 1, day));
  return timestamp.getUTCFullYear() === year &&
    timestamp.getUTCMonth() === month - 1 &&
    timestamp.getUTCDate() === day
    ? { day, month, year }
    : undefined;
}

export function resolveTimeZoneIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return;
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return;
  }
}

export function isCanonicalTimeZoneIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" && resolveTimeZoneIdentifier(value) === value
  );
}
