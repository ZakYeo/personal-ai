import type {
  NewWeatherWatch,
  WeatherWatchRecord,
} from "../ports/weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "../adapters/local/in-memory-weather-watch-store.js";

export const weatherWatchNow = new Date("2026-07-28T12:00:00.000Z");

export function createNewWeatherWatch(
  overrides: Partial<NewWeatherWatch> = {},
): NewWeatherWatch {
  return {
    condition: {
      metric: "precipitation",
      operator: "atLeast",
      threshold: 0.1,
      unit: "mm",
    },
    location: {
      countryCode: "GB",
      latitude: 51.5074,
      longitude: -0.1278,
      name: "London",
      timezone: "Europe/London",
    },
    period: {
      endAt: "2026-07-29T12:00:00.000Z",
      startAt: "2026-07-28T12:00:00.000Z",
    },
    ...overrides,
  };
}

export function createActiveWeatherWatch(
  overrides: Partial<WeatherWatchRecord> = {},
): WeatherWatchRecord {
  return {
    ...createNewWeatherWatch(),
    createdAt: weatherWatchNow.toISOString(),
    id: "weather-watch-1",
    revision: 1,
    status: "active",
    updatedAt: weatherWatchNow.toISOString(),
    ...overrides,
  };
}

export function createWeatherWatchStoreFixture(
  overrides: Partial<{
    createId(): string;
    now(): Date;
  }> = {},
) {
  return createInMemoryWeatherWatchStore({
    createId: overrides.createId ?? (() => "weather-watch-1"),
    now: overrides.now ?? (() => weatherWatchNow),
  });
}
