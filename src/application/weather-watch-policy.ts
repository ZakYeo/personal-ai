import type {
  NewWeatherWatch,
  WeatherWatchRecord,
} from "../ports/weather-watch-store.js";
import type { WeatherPeriod } from "../ports/weather.js";
import {
  isCanonicalWeatherTimestamp,
  isValidWeatherLocation,
  isValidWeatherPeriod,
} from "./weather-policy.js";
import { assertValidWeatherWatchCondition } from "./weather-watch-condition-policy.js";

const maxActiveWeatherWatches = 24;

export function assertWeatherWatchActiveLimit(
  watches: readonly WeatherWatchRecord[],
): void {
  if (
    watches.filter((watch) => watch.status === "active").length >
    maxActiveWeatherWatches
  ) {
    throw new Error(
      `Weather watch state cannot contain more than ${maxActiveWeatherWatches} active watches.`,
    );
  }
}

export function assertValidNewWeatherWatch(watch: NewWeatherWatch): void {
  if (
    !isValidWeatherLocation(watch.location) ||
    !isValidWeatherPeriod(watch.period) ||
    !isValidCondition(watch.condition)
  ) {
    throw invalidWatch();
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

function isValidCondition(condition: NewWeatherWatch["condition"]): boolean {
  try {
    assertValidWeatherWatchCondition(condition);
    return true;
  } catch {
    return false;
  }
}

function invalidWatch(): Error {
  return new Error("Weather watch state is invalid.");
}
