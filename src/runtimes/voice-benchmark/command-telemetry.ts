interface CommandTelemetry {
  cpuMs: number;
  peakRssBytes: number;
  wallMs: number;
}

export function parseGnuTimeTelemetry(value: string): CommandTelemetry {
  const fields = value.trim().split("\t");
  if (fields.length !== 4) {
    throw new Error(
      "GNU time telemetry must contain four tab-separated fields.",
    );
  }
  const parsed = fields.map((field) => Number(field));
  const userSeconds = parsed[0] ?? Number.NaN;
  const systemSeconds = parsed[1] ?? Number.NaN;
  const peakRssKiB = parsed[2] ?? Number.NaN;
  const wallSeconds = parsed[3] ?? Number.NaN;
  const measurements = [userSeconds, systemSeconds, peakRssKiB, wallSeconds];
  if (measurements.some((measurement) => !Number.isFinite(measurement))) {
    throw new Error("GNU time telemetry fields must be finite numbers.");
  }
  if (measurements.some((measurement) => measurement < 0)) {
    throw new Error("GNU time telemetry fields must be nonnegative.");
  }
  return {
    cpuMs: Math.round((userSeconds + systemSeconds) * 1_000),
    peakRssBytes: Math.round(peakRssKiB * 1_024),
    wallMs: Math.round(wallSeconds * 1_000),
  };
}
