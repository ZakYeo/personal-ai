export function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

export function requireNonEmptyString(value: unknown, label: string): string {
  const parsed = requireString(value, label);
  if (parsed.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return parsed;
}

export function requireStableId(value: unknown, label: string): string {
  const id = requireNonEmptyString(value, label);
  if (!/^[a-z\d]+(?:[._-][a-z\d]+)*$/u.test(id)) {
    throw new Error(`${label} must be a stable lowercase identifier.`);
  }
  return id;
}

export function requireSha256Digest(value: unknown, label: string): string {
  const digest = requireNonEmptyString(value, label);
  if (!/^[a-f\d]{64}$/u.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
  return digest;
}

export function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}
