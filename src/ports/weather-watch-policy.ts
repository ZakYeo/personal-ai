import type {
  NewWeatherWatch,
  WeatherWatchCondition,
  WeatherWatchRecord,
} from "./weather-watch-store.js";
import type { WeatherLocation, WeatherPeriod } from "./weather.js";

const maxWatchDurationMs = 16 * 24 * 60 * 60_000;

export function assertValidNewWeatherWatch(watch: NewWeatherWatch): void {
  if (
    !isValidWeatherLocation(watch.location) ||
    !isValidPeriod(watch.period) ||
    !isValidCondition(watch.condition)
  ) {
    throw invalidWatch();
  }
}

export function assertValidWeatherWatchRecord(watch: WeatherWatchRecord): void {
  assertValidNewWeatherWatch(watch);
  if (
    watch.id.length === 0 ||
    !isCanonicalTimestamp(watch.createdAt) ||
    !isCanonicalTimestamp(watch.updatedAt) ||
    watch.updatedAt < watch.createdAt ||
    !Number.isInteger(watch.revision) ||
    watch.revision < 1 ||
    !hasConsistentLifecycle(watch)
  ) {
    throw invalidWatch();
  }
}

export function cloneWeatherWatch(
  watch: WeatherWatchRecord,
): WeatherWatchRecord {
  return {
    ...watch,
    condition: { ...watch.condition },
    location: { ...watch.location },
    ...(watch.notification
      ? {
          notification: {
            ...watch.notification,
            window: { ...watch.notification.window },
          },
        }
      : {}),
    period: { ...watch.period },
  };
}

export function cloneNewWeatherWatch(watch: NewWeatherWatch): NewWeatherWatch {
  return {
    condition: { ...watch.condition },
    location: { ...watch.location },
    period: { ...watch.period },
  };
}

function hasConsistentLifecycle(watch: WeatherWatchRecord): boolean {
  if (watch.status === "active") {
    return watch.terminalAt === undefined && watch.notification === undefined;
  }
  if (
    !isCanonicalTimestamp(watch.terminalAt) ||
    watch.terminalAt !== watch.updatedAt
  ) {
    return false;
  }
  if (watch.status !== "triggered") return watch.notification === undefined;
  return (
    watch.notification !== undefined &&
    watch.notification.claimedAt === watch.terminalAt &&
    isValidNotificationWindow(watch.notification.window, watch.period)
  );
}

function isValidNotificationWindow(
  window: WeatherPeriod,
  watchPeriod: WeatherPeriod,
): boolean {
  return (
    isValidPeriod(window) &&
    window.startAt >= watchPeriod.startAt &&
    window.endAt <= watchPeriod.endAt
  );
}

function isValidWeatherLocation(location: WeatherLocation): boolean {
  return (
    location.name.trim().length > 0 &&
    location.name.length <= 200 &&
    /^[A-Z]{2}$/u.test(location.countryCode) &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    isCanonicalTimeZone(location.timezone)
  );
}

function isValidPeriod(period: WeatherPeriod): boolean {
  if (
    !isCanonicalTimestamp(period.startAt) ||
    !isCanonicalTimestamp(period.endAt)
  ) {
    return false;
  }
  const duration =
    new Date(period.endAt).getTime() - new Date(period.startAt).getTime();
  return duration >= 0 && duration <= maxWatchDurationMs;
}

function isValidCondition(condition: WeatherWatchCondition): boolean {
  if (!Number.isFinite(condition.threshold)) return false;
  switch (condition.metric) {
    case "precipitation":
      return (
        condition.operator === "atLeast" &&
        condition.unit === "mm" &&
        condition.threshold >= 0 &&
        condition.threshold <= 1_000
      );
    case "temperature":
      return (
        (condition.operator === "atLeast" || condition.operator === "atMost") &&
        condition.unit === "celsius" &&
        condition.threshold >= -100 &&
        condition.threshold <= 100
      );
    case "windSpeed":
      return (
        condition.operator === "atLeast" &&
        condition.unit === "km/h" &&
        condition.threshold >= 0 &&
        condition.threshold <= 500
      );
  }
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isCanonicalTimeZone(value: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en", {
        timeZone: value,
      }).resolvedOptions().timeZone === value
    );
  } catch {
    return false;
  }
}

function invalidWatch(): Error {
  return new Error("Weather watch state is invalid.");
}
