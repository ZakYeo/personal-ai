import { containsControlCharacters } from "./text-safety.js";

export const presentationTextLimits = Object.freeze({
  identifier: 128,
  request: 16_000,
  text: 4_000,
  transcript: 2_000,
});

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isIdentifier(value: unknown): value is string {
  return isSafePresentationText(
    value,
    presentationTextLimits.identifier,
    false,
  );
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafePresentationText(
  value: unknown,
  maximum: number,
  allowEmpty: boolean,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    value.length <= maximum &&
    !containsControlCharacters(value)
  );
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
