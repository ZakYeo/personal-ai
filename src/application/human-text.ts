import { zonedParts } from "./local-date-time.js";

type SpokenDateStyle = "calendar" | "contextual";

interface SpokenTextContext {
  assistantTimeZone: string;
  dateStyle?: SpokenDateStyle;
  now: Date;
  timeZone: string;
}

type SpokenFactForm = "date" | "date_time" | "time" | "time_zone";

const isoInstantSource = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})`;
const rfcInstantSource = String.raw`(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|[+-]\d{4})`;
const isoInstantPattern = new RegExp(`\\b${isoInstantSource}\\b`, "gu");
const rfcInstantPattern = new RegExp(`\\b${rfcInstantSource}\\b`, "gu");
const isoInstantSafetyPattern = new RegExp(`\\b${isoInstantSource}\\b`, "u");
const rfcInstantSafetyPattern = new RegExp(`\\b${rfcInstantSource}\\b`, "u");
const ianaTimeZoneCandidatePattern =
  /\b[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+\b/gu;
const rawUrlPattern = /(?:https?:\/\/|www\.)[^\s)\]]+/giu;
const safeSpokenFallback =
  "I have a result, but part of it cannot be read aloud safely.";

export function humanizeSpokenText(
  value: string,
  context: SpokenTextContext,
): string {
  const humanized = sanitizeHumanTextMarkup(value, "the linked source")
    .replace(isoInstantPattern, (instant) => renderInstant(instant, context))
    .replace(rfcInstantPattern, (instant) => renderInstant(instant, context))
    .replace(ianaTimeZoneCandidatePattern, (candidate) =>
      isCanonicalTimeZone(candidate)
        ? formatTimeZoneLabel(candidate)
        : candidate,
    )
    .replace(/\(\s*\)/gu, "")
    .replace(/\bOn (today|tomorrow|yesterday)\b/gu, (_, day: string) =>
      capitalize(day),
    )
    .replace(/\bon (today|tomorrow|yesterday)\b/gu, "$1")
    .replace(/\s+([,.!?;:])(?=\s|$)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();

  if (humanized.length === 0 || !isSpokenTextSafe(humanized)) {
    return safeSpokenFallback;
  }
  return /^the linked source[.!?]?$/iu.test(humanized)
    ? `${capitalize(humanized.replace(/[.!?]+$/u, ""))}.`
    : humanized;
}

export function sanitizeHumanTextMarkup(
  value: string,
  rawUrlReplacement = "",
): string {
  return value
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/giu, "$1")
    .replace(/\(\s*(?:https?:\/\/|www\.)[^\s)\]]+\s*\)/giu, "")
    .replace(rawUrlPattern, (url) => replaceRawUrl(url, rawUrlReplacement))
    .replace(/\[\d+\]/gu, "")
    .replace(/[*_~`>#]+/gu, "")
    .replace(/\b(?:at|from|via)\s+(?=[,.!?;:]|$)/giu, "");
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
    !isoInstantSafetyPattern.test(value) &&
    !rfcInstantSafetyPattern.test(value) &&
    !containsIanaTimeZone(value)
  );
}

export function renderSpokenFact(
  value: string,
  context: SpokenTextContext,
): string {
  const instant = renderInstant(value, context);
  if (instant !== value) return instant;

  const date = parseIsoDate(value);
  if (date) {
    return context.dateStyle === "calendar"
      ? renderCalendarDate(date, context.now)
      : renderContextualDate(date, context.now, context.timeZone);
  }

  const time = renderLocalTime(value);
  if (time) return time;

  if (isCanonicalTimeZone(value)) return formatTimeZoneLabel(value);

  return value;
}

export function classifySpokenFact(value: string): SpokenFactForm | undefined {
  if (isSupportedInstant(value) && Number.isFinite(new Date(value).getTime())) {
    return "date_time";
  }
  if (parseIsoDate(value)) return "date";
  if (renderLocalTime(value)) return "time";
  if (isCanonicalTimeZone(value)) return "time_zone";
  return undefined;
}

function renderInstant(value: string, context: SpokenTextContext): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || !isSupportedInstant(value)) {
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

function isSupportedInstant(value: string): boolean {
  return (
    new RegExp(`^${isoInstantSource}$`, "u").test(value) ||
    new RegExp(`^${rfcInstantSource}$`, "u").test(value)
  );
}

function containsIanaTimeZone(value: string): boolean {
  ianaTimeZoneCandidatePattern.lastIndex = 0;
  return [...value.matchAll(ianaTimeZoneCandidatePattern)].some((match) =>
    isCanonicalTimeZone(match[0]),
  );
}

function replaceRawUrl(url: string, replacement: string): string {
  const punctuation = /[.,!?;:]+$/u.exec(url)?.[0] ?? "";
  return `${replacement}${punctuation}`;
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

function renderCalendarDate(
  date: { day: number; month: number; year: number },
  now: Date,
): string {
  const dateDay = Date.UTC(date.year, date.month - 1, date.day);
  const currentDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayDifference = (dateDay - currentDay) / 86_400_000;

  if (dayDifference === -1) return "yesterday";
  if (dayDifference === 0) return "today";
  if (dayDifference === 1) return "tomorrow";

  if (dayDifference >= 2) {
    const daysUntilNextMonday = (8 - now.getUTCDay()) % 7 || 7;
    const weekday = weekdayNames[new Date(dateDay).getUTCDay()];
    const ordinalDay = formatOrdinal(date.day);
    if (weekday && dayDifference < daysUntilNextMonday) {
      return `this ${weekday} the ${ordinalDay}`;
    }
    if (weekday && dayDifference < daysUntilNextMonday + 7) {
      return `next ${weekday} the ${ordinalDay}`;
    }
  }

  const month = monthNames[date.month - 1];
  return date.year === now.getUTCFullYear()
    ? `${date.day} ${month}`
    : `${date.day} ${month} ${date.year}`;
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
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value === "UTC" || value.includes("/");
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
