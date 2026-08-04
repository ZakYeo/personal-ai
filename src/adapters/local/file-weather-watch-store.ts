import { randomUUID } from "node:crypto";

import type {
  NewWeatherWatch,
  WeatherWatchRecord,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import { cloneWeatherWatch } from "../../application/weather-watch-policy.js";
import {
  assertValidWeatherWatchStateDocument,
  parseWeatherWatchState,
  type WeatherWatchStateDocument,
} from "./weather-watch-state-schema.js";
import {
  cancelWeatherWatch,
  claimWeatherWatchNotification,
  createActiveWeatherWatch,
  expireWeatherWatch,
} from "./weather-watch-record.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import {
  createSerializedExecutor,
  type SerializedExecutor,
} from "./serialized-executor.js";

export type WeatherWatchStoreFileSystem = LocalJsonStateFileSystem;

export interface FileWeatherWatchStoreDependencies {
  createId?: () => string;
  fileSystem?: WeatherWatchStoreFileSystem;
}

interface FileWeatherWatchStoreOptions extends FileWeatherWatchStoreDependencies {
  filePath: string;
  now: () => Date;
}

export function createFileWeatherWatchStore(
  options: FileWeatherWatchStoreOptions,
): WeatherWatchStore {
  const createId = options.createId ?? (() => `weather-watch-${randomUUID()}`);
  const fileSystem = options.fileSystem ?? createNodeLocalJsonStateFileSystem();
  const enqueue = createSerializedExecutor();

  return {
    add: (watch) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const stored = createStoredWatch(
          watch,
          createId(),
          options.now(),
          state.watches,
        );
        await writeState(
          options.filePath,
          { version: 1, watches: [...state.watches, stored] },
          fileSystem,
        );
        return cloneWeatherWatch(stored);
      }),
    cancel: (request) =>
      updateStoredWatch(
        options.filePath,
        fileSystem,
        enqueue,
        request.id,
        (watch) => cancelWeatherWatch(watch, request),
      ),
    claimNotification: (request) =>
      updateStoredWatch(
        options.filePath,
        fileSystem,
        enqueue,
        request.id,
        (watch) => claimWeatherWatchNotification(watch, request),
      ),
    expire: (request) =>
      updateStoredWatch(
        options.filePath,
        fileSystem,
        enqueue,
        request.id,
        (watch) => expireWeatherWatch(watch, request),
      ),
    list: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.watches.map(cloneWeatherWatch);
      }),
  };
}

function updateStoredWatch(
  filePath: string,
  fileSystem: WeatherWatchStoreFileSystem,
  enqueue: SerializedExecutor,
  id: string,
  update: (watch: WeatherWatchRecord) => WeatherWatchRecord | undefined,
): Promise<WeatherWatchRecord | undefined> {
  return enqueue(async () => {
    const state = await readState(filePath, fileSystem);
    const index = state.watches.findIndex((watch) => watch.id === id);
    const current = state.watches[index];
    if (!current) return;
    const updated = update(current);
    if (!updated) return;
    const watches = [...state.watches];
    watches[index] = updated;
    await writeState(filePath, { version: 1, watches }, fileSystem);
    return cloneWeatherWatch(updated);
  });
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

async function readState(
  filePath: string,
  fileSystem: WeatherWatchStoreFileSystem,
): Promise<WeatherWatchStateDocument> {
  return readLocalJsonState({
    filePath,
    fileSystem,
    invalidJsonMessage: "Weather watch state file contains invalid JSON.",
    missingState: () => ({ version: 1, watches: [] }),
    parse: parseWeatherWatchState,
    readFailureMessage: "Could not read weather watch state.",
  });
}

async function writeState(
  filePath: string,
  state: WeatherWatchStateDocument,
  fileSystem: WeatherWatchStoreFileSystem,
): Promise<void> {
  assertValidWeatherWatchStateDocument(state);
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist weather watch state.",
    state,
  });
}
