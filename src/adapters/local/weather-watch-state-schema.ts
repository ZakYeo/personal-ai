import type {
  WeatherWatchCondition,
  WeatherWatchNotification,
  WeatherWatchRecord,
  WeatherWatchStatus,
} from "../../ports/weather-watch-store.js";
import { assertValidWeatherWatchRecord } from "../../ports/weather-watch-policy.js";
import type { WeatherLocation, WeatherPeriod } from "../../ports/weather.js";
import { isRecord } from "../parsing.js";

export interface WeatherWatchStateDocument {
  version: 1;
  watches: WeatherWatchRecord[];
}

const maxStoredWatches = 1_000;
const statuses = new Set<WeatherWatchStatus>([
  "active",
  "cancelled",
  "expired",
  "triggered",
]);

export function parseWeatherWatchState(
  value: unknown,
): WeatherWatchStateDocument {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Weather watch state has an unsupported version.");
  }
  if (!Array.isArray(value.watches)) throw invalidState();
  const state: WeatherWatchStateDocument = {
    version: 1,
    watches: value.watches.map(parseWatch),
  };
  assertValidWeatherWatchStateDocument(state);
  return state;
}

export function assertValidWeatherWatchStateDocument(
  state: WeatherWatchStateDocument,
): void {
  if (state.watches.length > maxStoredWatches) {
    throw new Error(
      `Weather watch state cannot contain more than ${maxStoredWatches} watches.`,
    );
  }
  const ids = new Set<string>();
  for (const watch of state.watches) {
    if (ids.has(watch.id)) {
      throw new Error(
        "Weather watch state contains duplicate weather watch IDs.",
      );
    }
    ids.add(watch.id);
    try {
      assertValidWeatherWatchRecord(watch);
    } catch (cause) {
      throw new Error("Weather watch state contains invalid watch state.", {
        cause,
      });
    }
  }
}

function parseWatch(value: unknown): WeatherWatchRecord {
  if (
    !isRecord(value) ||
    !isString(value.createdAt) ||
    !isString(value.id) ||
    !isInteger(value.revision) ||
    !isStatus(value.status) ||
    !isString(value.updatedAt) ||
    (value.terminalAt !== undefined && !isString(value.terminalAt))
  ) {
    throw invalidState();
  }
  const watch: WeatherWatchRecord = {
    condition: parseCondition(value.condition),
    createdAt: value.createdAt,
    id: value.id,
    location: parseLocation(value.location),
    period: parsePeriod(value.period),
    revision: value.revision,
    status: value.status,
    updatedAt: value.updatedAt,
    ...(value.notification === undefined
      ? {}
      : { notification: parseNotification(value.notification) }),
    ...(value.terminalAt === undefined ? {} : { terminalAt: value.terminalAt }),
  };
  return watch;
}

function parseCondition(value: unknown): WeatherWatchCondition {
  if (
    !isRecord(value) ||
    !isString(value.metric) ||
    !isString(value.operator) ||
    !isNumber(value.threshold) ||
    !isString(value.unit)
  ) {
    throw invalidState();
  }
  if (
    value.metric === "precipitation" &&
    value.operator === "atLeast" &&
    value.unit === "mm"
  ) {
    return {
      metric: value.metric,
      operator: value.operator,
      threshold: value.threshold,
      unit: value.unit,
    };
  }
  if (
    value.metric === "temperature" &&
    (value.operator === "atLeast" || value.operator === "atMost") &&
    value.unit === "celsius"
  ) {
    return {
      metric: value.metric,
      operator: value.operator,
      threshold: value.threshold,
      unit: value.unit,
    };
  }
  if (
    value.metric === "windSpeed" &&
    value.operator === "atLeast" &&
    value.unit === "km/h"
  ) {
    return {
      metric: value.metric,
      operator: value.operator,
      threshold: value.threshold,
      unit: value.unit,
    };
  }
  throw invalidState();
}

function parseLocation(value: unknown): WeatherLocation {
  if (
    !isRecord(value) ||
    !isString(value.countryCode) ||
    !isNumber(value.latitude) ||
    !isNumber(value.longitude) ||
    !isString(value.name) ||
    !isString(value.timezone)
  ) {
    throw invalidState();
  }
  return {
    countryCode: value.countryCode,
    latitude: value.latitude,
    longitude: value.longitude,
    name: value.name,
    timezone: value.timezone,
  };
}

function parsePeriod(value: unknown): WeatherPeriod {
  if (!isRecord(value) || !isString(value.endAt) || !isString(value.startAt)) {
    throw invalidState();
  }
  return { endAt: value.endAt, startAt: value.startAt };
}

function parseNotification(value: unknown): WeatherWatchNotification {
  if (!isRecord(value) || !isString(value.claimedAt)) {
    throw invalidState();
  }
  return {
    claimedAt: value.claimedAt,
    window: parsePeriod(value.window),
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStatus(value: unknown): value is WeatherWatchStatus {
  return typeof value === "string" && statuses.has(value as WeatherWatchStatus);
}

function invalidState(): Error {
  return new Error("Weather watch state contains invalid watch state.");
}
