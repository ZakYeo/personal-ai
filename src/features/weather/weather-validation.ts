import type { WeatherPeriod } from "../../ports/weather.js";

const maxForecastDays = 16;

export function createCurrentWeatherPeriod(now: Date): WeatherPeriod {
  const timestamp = now.toISOString();
  return { endAt: timestamp, startAt: timestamp };
}

export function createForecastWeatherPeriod(
  args: { endAt?: string; location?: string; startAt?: string },
  now: Date,
): WeatherPeriod {
  const start = parseTimestamp(args.startAt ?? now.toISOString(), "startAt");
  const end = parseTimestamp(
    args.endAt ?? new Date(start.getTime() + 24 * 60 * 60_000).toISOString(),
    "endAt",
  );
  if (
    end.getTime() < start.getTime() ||
    end.getTime() - start.getTime() > maxForecastDays * 24 * 60 * 60_000
  ) {
    throw new Error(
      `Weather forecast periods must be ordered and no longer than ${maxForecastDays} days.`,
    );
  }
  return { endAt: end.toISOString(), startAt: start.toISOString() };
}

function parseTimestamp(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Weather ${label} must be an exact ISO timestamp.`);
  }
  return parsed;
}
