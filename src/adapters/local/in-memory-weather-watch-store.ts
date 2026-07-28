import type {
  NewWeatherWatch,
  WeatherWatchRecord,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import {
  assertWeatherWatchActiveLimit,
  cloneWeatherWatch,
} from "../../ports/weather-watch-policy.js";
import {
  cancelWeatherWatch,
  claimWeatherWatchNotification,
  createActiveWeatherWatch,
  expireWeatherWatch,
} from "./weather-watch-record.js";

interface InMemoryWeatherWatchStoreOptions {
  createId?: () => string;
  now: () => Date;
}

export function createInMemoryWeatherWatchStore(
  options: InMemoryWeatherWatchStoreOptions,
): WeatherWatchStore {
  const watches: WeatherWatchRecord[] = [];
  const createId =
    options.createId ?? (() => `weather-watch-${watches.length + 1}`);

  return {
    add: (watch) =>
      Promise.resolve().then(() => {
        const stored = createStoredWatch(
          watch,
          createId(),
          options.now(),
          watches,
        );
        assertWeatherWatchActiveLimit([...watches, stored]);
        watches.push(stored);
        return cloneWeatherWatch(stored);
      }),
    cancel: (request) =>
      Promise.resolve().then(() =>
        applyUpdate(watches, request.id, (watch) =>
          cancelWeatherWatch(watch, request),
        ),
      ),
    claimNotification: (request) =>
      Promise.resolve().then(() =>
        applyUpdate(watches, request.id, (watch) =>
          claimWeatherWatchNotification(watch, request),
        ),
      ),
    expire: (request) =>
      Promise.resolve().then(() =>
        applyUpdate(watches, request.id, (watch) =>
          expireWeatherWatch(watch, request),
        ),
      ),
    list: () => Promise.resolve().then(() => watches.map(cloneWeatherWatch)),
  };
}

function createStoredWatch(
  input: NewWeatherWatch,
  id: string,
  now: Date,
  existing: readonly WeatherWatchRecord[],
): WeatherWatchRecord {
  if (id.length === 0 || existing.some((watch) => watch.id === id)) {
    throw new Error(
      "Weather watch store generated an invalid or duplicate ID.",
    );
  }
  return createActiveWeatherWatch(input, id, now);
}

function applyUpdate(
  watches: WeatherWatchRecord[],
  id: string,
  update: (watch: WeatherWatchRecord) => WeatherWatchRecord | undefined,
): WeatherWatchRecord | undefined {
  const index = watches.findIndex((watch) => watch.id === id);
  const current = watches[index];
  if (!current) return;
  const updated = update(current);
  if (!updated) return;
  watches[index] = updated;
  return cloneWeatherWatch(updated);
}
