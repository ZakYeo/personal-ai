import type { AssistantCommandParameters } from "../../ports/assistant.js";
import type { ProtectedResponseFact } from "../../ports/response-rewriter.js";

interface FactReplacement extends ProtectedResponseFact {
  occurrences: number;
  rendering: string;
}

interface ProtectedResponse {
  facts: readonly ProtectedResponseFact[];
  restore(rewrittenText: string): string;
  text: string;
}

export function protectResponseFacts(
  text: string,
  facts: AssistantCommandParameters,
  now: Date,
): ProtectedResponse {
  const groupedFacts = groupFactsByValue(facts);
  const replacements: FactReplacement[] = [];
  let protectedText = text;

  for (const [value, names] of groupedFacts) {
    const token = createFactToken(replacements.length, text);
    const replaced = replaceFact(
      protectedText,
      value,
      token,
      replacements.map((replacement) => replacement.token),
    );

    if (replaced.occurrences === 0) {
      continue;
    }

    protectedText = replaced.text;
    replacements.push({
      names,
      occurrences: replaced.occurrences,
      rendering: renderFact(value, now),
      token,
    });
  }

  return {
    facts: replacements.map(({ names, token }) => ({ names, token })),
    restore: (rewrittenText) => restoreFacts(rewrittenText, replacements),
    text: protectedText,
  };
}

function groupFactsByValue(
  facts: AssistantCommandParameters,
): Array<[string, readonly string[]]> {
  const namesByValue = new Map<string, string[]>();

  for (const [name, value] of Object.entries(facts)) {
    if (value === null || value === undefined) {
      continue;
    }

    const text = String(value);

    if (text.length === 0) {
      continue;
    }

    const names = namesByValue.get(text) ?? [];
    names.push(name);
    namesByValue.set(text, names);
  }

  return [...namesByValue.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );
}

function replaceFact(
  text: string,
  value: string,
  token: string,
  protectedTokens: readonly string[],
): { occurrences: number; text: string } {
  let occurrences = 0;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`,
    "gu",
  );

  const replacedText = text.replace(pattern, (match, offset: number) => {
    if (isInsideProtectedToken(text, offset, protectedTokens)) {
      return match;
    }

    occurrences += 1;
    return token;
  });

  return { occurrences, text: replacedText };
}

function isInsideProtectedToken(
  text: string,
  offset: number,
  protectedTokens: readonly string[],
): boolean {
  return protectedTokens.some((token) => {
    let tokenOffset = text.indexOf(token);

    while (tokenOffset >= 0) {
      if (offset >= tokenOffset && offset < tokenOffset + token.length) {
        return true;
      }

      tokenOffset = text.indexOf(token, tokenOffset + token.length);
    }

    return false;
  });
}

function restoreFacts(
  rewrittenText: string,
  replacements: readonly FactReplacement[],
): string {
  let restoredText = rewrittenText;

  for (const replacement of replacements) {
    if (
      countOccurrences(restoredText, replacement.token) !==
      replacement.occurrences
    ) {
      throw new Error(
        `Response rewrite changed protected fact token ${replacement.token}.`,
      );
    }

    restoredText = restoredText.replaceAll(
      replacement.token,
      replacement.rendering,
    );
  }

  if (restoredText.includes("__ASSISTANT_PROTECTED_FACT_")) {
    throw new Error(
      "Response rewrite introduced an unknown protected fact token.",
    );
  }

  return restoredText;
}

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

function createFactToken(index: number, sourceText: string): string {
  let token = `__ASSISTANT_PROTECTED_FACT_${index}__`;

  while (sourceText.includes(token)) {
    token = `${token}_`;
  }

  return token;
}

function renderFact(value: string, now: Date): string {
  const date = parseIsoDate(value);

  if (!date) {
    return renderLocalTime(value) ?? value;
  }

  const dateDay = Date.UTC(date.year, date.month - 1, date.day);
  const currentDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayDifference = (dateDay - currentDay) / 86_400_000;

  if (dayDifference === -1) {
    return "yesterday";
  }

  if (dayDifference === 0) {
    return "today";
  }

  if (dayDifference === 1) {
    return "tomorrow";
  }

  if (dayDifference >= 2) {
    const currentWeekday = now.getUTCDay();
    const daysUntilNextMonday = (8 - currentWeekday) % 7 || 7;
    const weekday = weekdayNames[new Date(dateDay).getUTCDay()];
    const ordinalDay = formatOrdinal(date.day);

    if (weekday && dayDifference < daysUntilNextMonday) {
      return `this ${weekday} the ${ordinalDay}`;
    }

    if (weekday && dayDifference < daysUntilNextMonday + 7) {
      return `next ${weekday} the ${ordinalDay}`;
    }
  }

  const month = monthNames[date.month - 1] ?? value;

  return date.year === now.getUTCFullYear()
    ? `${date.day} ${month}`
    : `${date.day} ${month} ${date.year}`;
}

function renderLocalTime(value: string): string | undefined {
  const match = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u.exec(value);

  if (!match?.groups) {
    return undefined;
  }

  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);

  if (hour === 0 && minute === 0) {
    return "midnight";
  }

  if (hour === 12 && minute === 0) {
    return "noon";
  }

  const spokenHour = hour % 12 || 12;
  const spokenMinute =
    minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  const period = hour < 12 ? "am" : "pm";

  return `${spokenHour}${spokenMinute}${period}`;
}

function formatOrdinal(value: number): string {
  const finalTwoDigits = value % 100;

  if (finalTwoDigits >= 11 && finalTwoDigits <= 13) {
    return `${value}th`;
  }

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

function parseIsoDate(
  value: string,
): { day: number; month: number; year: number } | undefined {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);

  if (!match?.groups) {
    return undefined;
  }

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
