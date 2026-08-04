import type { AssistantCommandParameters } from "../../ports/assistant.js";
import {
  classifySpokenFact,
  renderSpokenFact,
} from "../../ports/human-text.js";
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
  timeZone = "UTC",
  assistantTimeZone = timeZone,
  dateStyle: "calendar" | "contextual" = "calendar",
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
    const spokenForm = classifySpokenFact(value);
    replacements.push({
      names,
      occurrences: replaced.occurrences,
      rendering: renderSpokenFact(value, {
        assistantTimeZone,
        dateStyle,
        now,
        timeZone,
      }),
      ...(spokenForm ? { spokenForm } : {}),
      token,
    });
  }

  return {
    facts: replacements.map(({ names, spokenForm, token }) => ({
      names,
      ...(spokenForm ? { spokenForm } : {}),
      token,
    })),
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

    if (text.length === 0 || isHttpUrl(text)) {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
