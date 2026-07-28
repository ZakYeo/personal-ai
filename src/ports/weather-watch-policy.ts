import type {
  NewWeatherWatch,
  WeatherWatchCondition,
  WeatherWatchRecord,
} from "./weather-watch-store.js";
import type { WeatherPeriod } from "./weather.js";
import {
  isCanonicalWeatherTimestamp,
  isValidWeatherLocation,
  isValidWeatherPeriod,
} from "./weather-policy.js";

export function assertValidNewWeatherWatch(watch: NewWeatherWatch): void {
  if (
    !isValidWeatherLocation(watch.location) ||
    !isValidWeatherPeriod(watch.period) ||
    !isValidCondition(watch.condition)
  ) {
    throw invalidWatch();
  }
}

export function assertValidWeatherWatchCondition(
  condition: WeatherWatchCondition,
): void {
  if (!isValidCondition(condition)) {
    throw new Error("Weather watch condition is invalid.");
  }
}

export function assertValidWeatherWatchRecord(watch: WeatherWatchRecord): void {
  assertValidNewWeatherWatch(watch);
  if (
    watch.id.length === 0 ||
    !isCanonicalWeatherTimestamp(watch.createdAt) ||
    !isCanonicalWeatherTimestamp(watch.updatedAt) ||
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
    !isCanonicalWeatherTimestamp(watch.terminalAt) ||
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
    isValidWeatherPeriod(window) &&
    window.startAt >= watchPeriod.startAt &&
    window.endAt <= watchPeriod.endAt
  );
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

function invalidWatch(): Error {
  return new Error("Weather watch state is invalid.");
}
