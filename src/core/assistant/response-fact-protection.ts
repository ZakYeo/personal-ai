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
    const replaced = replaceFact(protectedText, value, token);

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
): { occurrences: number; text: string } {
  let occurrences = 0;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`,
    "gu",
  );

  const replacedText = text.replace(pattern, () => {
    occurrences += 1;
    return token;
  });

  return { occurrences, text: replacedText };
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
    return value;
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

  const month = monthNames[date.month - 1] ?? value;

  return date.year === now.getUTCFullYear()
    ? `${date.day} ${month}`
    : `${date.day} ${month} ${date.year}`;
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
