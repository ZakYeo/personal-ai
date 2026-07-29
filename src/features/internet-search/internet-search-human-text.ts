import { containsControlCharacters } from "../../ports/text-safety.js";

export function humanizeInternetSearchText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/giu, "$1")
    .replace(/\b(?:at|from|via)\s+(?=(?:https?:\/\/|www\.))/giu, "")
    .replace(/(?:https?:\/\/|www\.)[^\s)\]]+/giu, "")
    .replace(/\[\d+\]/gu, "")
    .replace(/[*_~`>#]+/gu, "")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function containsUnsafeInternetSearchTextControls(
  value: string,
): boolean {
  return containsControlCharacters(value.replace(/[\t\n\r]/gu, ""));
}
