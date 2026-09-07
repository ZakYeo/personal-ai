import {
  isCanonicalIsoTimestamp,
  isCanonicalTimeZoneIdentifier,
} from "../../application/temporal-policy.js";
import { containsControlCharacters } from "../../application/text-safety.js";
import { isRecord } from "../parsing.js";

export function invalidAttentionState(): Error {
  return new Error("Attention state contains invalid or unsupported data.");
}

export const attentionFields = {
  record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (
      !isRecord(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw invalidAttentionState();
    return value;
  },
  text(value: unknown, maximum = 1_000): string {
    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value.length > maximum ||
      containsControlCharacters(value)
    )
      throw invalidAttentionState();
    return value;
  },
  integer(
    value: unknown,
    minimum = 1,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > maximum
    )
      throw invalidAttentionState();
    return value;
  },
  finite(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw invalidAttentionState();
    return value;
  },
  boolean(value: unknown): boolean {
    if (typeof value !== "boolean") throw invalidAttentionState();
    return value;
  },
  timestamp(value: unknown): string {
    if (!isCanonicalIsoTimestamp(value)) throw invalidAttentionState();
    return value;
  },
  timeZone(value: unknown): string {
    if (!isCanonicalTimeZoneIdentifier(value)) throw invalidAttentionState();
    return value;
  },
  choice<const T extends readonly string[]>(
    value: unknown,
    choices: T,
  ): T[number] {
    const selected = choices.find((choice) => choice === value);
    if (selected === undefined) throw invalidAttentionState();
    return selected;
  },
  array<T>(value: unknown, maximum: number, parse: (value: unknown) => T): T[] {
    if (!Array.isArray(value) || value.length > maximum)
      throw invalidAttentionState();
    return value.map(parse);
  },
};
