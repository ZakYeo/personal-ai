import type { WeatherPeriod } from "../ports/weather.js";

const hourMs = 60 * 60_000;
const maximumForecastMs = 16 * 24 * hourMs;

export function createWeatherClothingPeriodPlan(
  args: { endAt?: string; startAt?: string },
  now: Date,
): {
  mode: "current" | "period" | "point";
  queryPeriod: WeatherPeriod;
  requestedPeriod: WeatherPeriod;
} {
  if (args.endAt !== undefined && args.startAt === undefined) {
    throw new Error("Weather clothing endAt requires startAt.");
  }
  if (args.startAt === undefined) {
    const timestamp = now.toISOString();
    const period = { endAt: timestamp, startAt: timestamp };
    return { mode: "current", queryPeriod: period, requestedPeriod: period };
  }

  const start = parseTimestamp(args.startAt, "startAt");
  const end = parseTimestamp(args.endAt ?? args.startAt, "endAt");
  const latest = now.getTime() + maximumForecastMs;
  if (start.getTime() < now.getTime() || end.getTime() < start.getTime()) {
    throw new Error(
      "Weather clothing periods must be ordered and not in the past.",
    );
  }
  if (end.getTime() > latest) {
    throw new Error("Weather clothing requests must be within 16 days.");
  }
  if (end.getTime() - start.getTime() > maximumForecastMs) {
    throw new Error("Weather clothing periods must be no longer than 16 days.");
  }

  const requestedPeriod = {
    endAt: end.toISOString(),
    startAt: start.toISOString(),
  };
  const queryStart = new Date(start.getTime() - hourMs);
  const queryEnd = new Date(Math.min(end.getTime() + hourMs, latest));
  if (queryEnd.getTime() - queryStart.getTime() > maximumForecastMs) {
    queryStart.setTime(queryEnd.getTime() - maximumForecastMs);
  }
  return {
    mode: args.endAt === undefined ? "point" : "period",
    queryPeriod: {
      endAt: queryEnd.toISOString(),
      startAt: queryStart.toISOString(),
    },
    requestedPeriod,
  };
}

function parseTimestamp(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(
      `Weather clothing ${label} must be an exact ISO timestamp.`,
    );
  }
  return parsed;
}
