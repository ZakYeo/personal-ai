export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOptionalNonEmptyString(
  value: unknown,
  message: string,
  defaultValue: string,
): string {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

export function parseOptionalPositiveInteger(
  value: unknown,
  message: string,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(message);
  }

  return value;
}
