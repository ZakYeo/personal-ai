import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import type {
  AlarmRecord,
  AlarmStore,
  NewAlarmRecord,
} from "../../ports/alarm-store.js";
import { isRecord } from "../parsing.js";
import {
  atomicReplaceFile,
  type AtomicFileSystem,
} from "./atomic-file-replacement.js";
import {
  applyAlarmLifecycleUpdate,
  cloneAlarmRecord,
  createScheduledAlarm,
} from "./alarm-record.js";
import {
  parseAlarmState,
  type AlarmStateDocument,
} from "./alarm-state-schema.js";

export interface AlarmStoreFileSystem {
  mkdir(
    path: string,
    options: { mode: number; recursive: true },
  ): Promise<unknown>;
  readFile(path: string): Promise<string>;
  replaceFile(options: {
    contents: string;
    targetPath: string;
    temporaryPath: string;
  }): Promise<void>;
}

interface FileAlarmStoreOptions {
  createId?: () => string;
  filePath: string;
  fileSystem?: AlarmStoreFileSystem;
  now: () => Date;
}

export type FileAlarmStoreDependencies = Pick<
  FileAlarmStoreOptions,
  "createId" | "fileSystem"
>;

const nodeAtomicFileSystem: AtomicFileSystem = {
  open,
  rename,
  unlink,
};

const nodeFileSystem: AlarmStoreFileSystem = {
  mkdir: (path, options) => mkdir(path, options),
  readFile: (path) => readFile(path, "utf8"),
  replaceFile: (options) =>
    atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
};

export function createFileAlarmStore(
  options: FileAlarmStoreOptions,
): AlarmStore {
  const createId = options.createId ?? randomUUID;
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const { now } = options;
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
    add: (alarm) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const storedAlarm = createStoredAlarm(
          alarm,
          createId(),
          now(),
          state.alarms,
        );

        await writeState(
          options.filePath,
          { alarms: [...state.alarms, storedAlarm], version: 3 },
          fileSystem,
        );

        return cloneAlarmRecord(storedAlarm);
      }),
    list: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.alarms.map(cloneAlarmRecord);
      }),
    removeTerminalBefore: (cutoff) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const alarms = state.alarms.filter(
          (alarm) =>
            alarm.terminalAt === undefined || alarm.terminalAt >= cutoff,
        );
        const removed = state.alarms.length - alarms.length;
        if (removed > 0) {
          await writeState(
            options.filePath,
            { alarms, version: 3 },
            fileSystem,
          );
        }
        return removed;
      }),
    update: (update) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const index = state.alarms.findIndex((alarm) => alarm.id === update.id);
        const current = state.alarms[index];

        if (!current) {
          return;
        }

        const updated = applyAlarmLifecycleUpdate(current, update);
        if (!updated) {
          return;
        }

        const alarms = [...state.alarms];
        alarms[index] = updated;
        await writeState(options.filePath, { alarms, version: 3 }, fileSystem);

        return cloneAlarmRecord(updated);
      }),
  };
}

function createStoredAlarm(
  alarm: NewAlarmRecord,
  id: string,
  now: Date,
  existing: readonly AlarmRecord[],
): AlarmRecord {
  if (id.length === 0 || existing.some((record) => record.id === id)) {
    throw new Error("Alarm store generated an invalid or duplicate ID.");
  }

  return createScheduledAlarm(alarm, id, now);
}

async function readState(
  filePath: string,
  fileSystem: AlarmStoreFileSystem,
): Promise<AlarmStateDocument> {
  let contents: string;

  try {
    contents = await fileSystem.readFile(filePath);
  } catch (cause) {
    if (isMissingFileError(cause)) {
      return { alarms: [], version: 3 };
    }

    throw new Error("Could not read alarm state.", { cause });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (cause) {
    throw new Error("Alarm state file contains invalid JSON.", { cause });
  }

  return parseAlarmState(parsed);
}

async function writeState(
  filePath: string,
  state: AlarmStateDocument,
  fileSystem: AlarmStoreFileSystem,
): Promise<void> {
  const directory = dirname(filePath);
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    await fileSystem.mkdir(directory, { mode: 0o700, recursive: true });
    await fileSystem.replaceFile({
      contents: `${JSON.stringify(state)}\n`,
      targetPath: filePath,
      temporaryPath,
    });
  } catch (cause) {
    throw new Error("Could not persist alarm state.", { cause });
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
