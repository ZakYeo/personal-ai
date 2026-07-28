import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";

import type {
  NewWeatherWatch,
  WeatherWatchRecord,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import { cloneWeatherWatch } from "../../ports/weather-watch-policy.js";
import {
  atomicReplaceFile,
  type AtomicFileSystem,
} from "./atomic-file-replacement.js";
import {
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

export type WeatherWatchStoreFileSystem = LocalJsonStateFileSystem;

export interface FileWeatherWatchStoreDependencies {
  createId?: () => string;
  fileSystem?: WeatherWatchStoreFileSystem;
}

interface FileWeatherWatchStoreOptions extends FileWeatherWatchStoreDependencies {
  filePath: string;
  now: () => Date;
}

const nodeAtomicFileSystem: AtomicFileSystem = {
  open,
  rename,
  unlink,
};

const nodeFileSystem: WeatherWatchStoreFileSystem = {
  mkdir: (path, options) => mkdir(path, options),
  readFile: (path) => readFile(path, "utf8"),
  replaceFile: (options) =>
    atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
};

export function createFileWeatherWatchStore(
  options: FileWeatherWatchStoreOptions,
): WeatherWatchStore {
  const createId = options.createId ?? (() => `weather-watch-${randomUUID()}`);
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  let pending: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }

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
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>,
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
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist weather watch state.",
    state,
  });
}
