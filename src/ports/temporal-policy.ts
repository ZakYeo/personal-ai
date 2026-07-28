export function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

export function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const timestamp = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(timestamp.getTime()) &&
    timestamp.toISOString().slice(0, 10) === value
  );
}
