import { containsControlCharacters } from "../../ports/text-safety.js";

export function containsUnsafeInternetSearchTextControls(
  value: string,
): boolean {
  return containsControlCharacters(value.replace(/[\t\n\r]/gu, ""));
}
