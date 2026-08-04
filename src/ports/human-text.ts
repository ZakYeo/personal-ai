import { zonedParts } from "./local-date-time.js";

export interface SpokenTextContext {
  assistantTimeZone: string;
  now: Date;
  timeZone: string;
}

const canonicalInstantPattern =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/gu;
const ianaTimeZonePattern =
  /\b(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\b/gu;
const canonicalInstantSafetyPattern =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/u;
const ianaTimeZoneSafetyPattern =
  /\b(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\b/u;

export function humanizeSpokenText(
  value: string,
  context: SpokenTextContext,
): string {
  return value
    .replace(canonicalInstantPattern, (instant) =>
      renderCanonicalInstant(instant, context),
    )
    .replace(ianaTimeZonePattern, (timeZone) => formatTimeZoneLabel(timeZone))
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/giu, "$1")
    .replace(/\b(?:at|from|via)\s+(?=(?:https?:\/\/|www\.))/giu, "")
    .replace(/(?:https?:\/\/|www\.)[^\s)\]]+/giu, "")
    .replace(/\[\d+\]/gu, "")
    .replace(/\(\s*\)/gu, "")
    .replace(/\bOn (today|tomorrow|yesterday)\b/gu, (_, day: string) =>
      capitalize(day),
    )
    .replace(/\bon (today|tomorrow|yesterday)\b/gu, "$1")
    .replace(/\s+([,.!?;:])(?=\s|$)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function isSpokenTextSafe(value: string): boolean {
  return (
    !/https?:\/\//iu.test(value) &&
    !/\bwww\./iu.test(value) &&
    !/\[[^\]]+\]\([^)]+\)/u.test(value) &&
    !/\[\d+\]/u.test(value) &&
    !canonicalInstantSafetyPattern.test(value) &&
    !ianaTimeZoneSafetyPattern.test(value)
  );
}

export function renderSpokenFact(
  value: string,
  context: SpokenTextContext,
): string {
  const instant = renderCanonicalInstant(value, context);
  if (instant !== value) return instant;

  const date = parseIsoDate(value);
  if (date) return renderContextualDate(date, context.now, context.timeZone);

  const time = renderLocalTime(value);
  if (time) return time;

  if (isCanonicalTimeZone(value)) return formatTimeZoneLabel(value);

  return value;
}

function renderCanonicalInstant(
  value: string,
  context: SpokenTextContext,
): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    return value;
  }

  const parts = zonedParts(instant, context.timeZone);
  const time = formatTime(parts.hour, parts.minute);
  const date = renderContextualDate(parts, context.now, context.timeZone);
  const timeZone =
    context.timeZone === context.assistantTimeZone
      ? ""
      : `, ${formatTimeZoneLabel(context.timeZone)}`;
  return `${time} ${date}${timeZone}`;
}

function renderContextualDate(
  date: Pick<ReturnType<typeof zonedParts>, "day" | "month" | "year">,
  now: Date,
  timeZone: string,
): string {
  const current = zonedParts(now, timeZone);
  const dateDay = Date.UTC(date.year, date.month - 1, date.day);
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  const dayDifference = (dateDay - currentDay) / 86_400_000;

  if (dayDifference === -1) return "yesterday";
  if (dayDifference === 0) return "today";
  if (dayDifference === 1) return "tomorrow";

  const ordinal = formatOrdinal(date.day);
  if (dayDifference > 1 && dayDifference <= 7) {
    const weekday = weekdayNames[new Date(dateDay).getUTCDay()];
    return `on ${weekday} the ${ordinal}`;
  }

  const month = monthNames[date.month - 1];
  return date.year === current.year
    ? `on ${date.day} ${month}`
    : `on ${date.day} ${month} ${date.year}`;
}

function renderLocalTime(value: string): string | undefined {
  const match = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u.exec(value);
  return match?.groups
    ? formatTime(Number(match.groups.hour), Number(match.groups.minute))
    : undefined;
}

function formatTime(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return "midnight";
  if (hour === 12 && minute === 0) return "noon";
  const spokenHour = hour % 12 || 12;
  const spokenMinute =
    minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${spokenHour}${spokenMinute}${hour < 12 ? "am" : "pm"}`;
}

function parseIsoDate(
  value: string,
): { day: number; month: number; year: number } | undefined {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) return;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? { day, month, year }
    : undefined;
}

function isCanonicalTimeZone(value: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
        .timeZone === value
    );
  } catch {
    return false;
  }
}

function formatTimeZoneLabel(value: string): string {
  if (value === "UTC") return "UTC";
  const location = value.split("/").at(-1)?.replaceAll("_", " ") ?? value;
  return `${location} time`;
}

function formatOrdinal(value: number): string {
  const finalTwoDigits = value % 100;
  if (finalTwoDigits >= 11 && finalTwoDigits <= 13) return `${value}th`;
  const suffix =
    value % 10 === 1
      ? "st"
      : value % 10 === 2
        ? "nd"
        : value % 10 === 3
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
