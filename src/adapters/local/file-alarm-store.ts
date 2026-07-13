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

export interface AlarmStoreFileSystem {
  mkdir(path: string): Promise<unknown>;
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
}

interface AlarmStateDocument {
  alarms: AlarmRecord[];
  version: 1;
}

const nodeAtomicFileSystem: AtomicFileSystem = {
  open,
  rename,
  unlink,
};

const nodeFileSystem: AlarmStoreFileSystem = {
  mkdir: (path) => mkdir(path, { recursive: true }),
  readFile: (path) => readFile(path, "utf8"),
  replaceFile: (options) =>
    atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
};

export function createFileAlarmStore(
  options: FileAlarmStoreOptions,
): AlarmStore {
  const createId = options.createId ?? randomUUID;
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
    add: (alarm) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const storedAlarm = createStoredAlarm(alarm, createId(), state.alarms);

        await writeState(
          options.filePath,
          { alarms: [...state.alarms, storedAlarm], version: 1 },
          fileSystem,
        );

        return { ...storedAlarm };
      }),
    list: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.alarms.map((alarm) => ({ ...alarm }));
      }),
  };
}

function createStoredAlarm(
  alarm: NewAlarmRecord,
  id: string,
  existing: readonly AlarmRecord[],
): AlarmRecord {
  if (id.length === 0 || existing.some((record) => record.id === id)) {
    throw new Error("Alarm store generated an invalid or duplicate ID.");
  }

  return { ...alarm, id };
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
      return { alarms: [], version: 1 };
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

function parseAlarmState(value: unknown): AlarmStateDocument {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.alarms)) {
    throw new Error("Alarm state file is invalid.");
  }

  const alarms = value.alarms.map(parseAlarmRecord);
  if (new Set(alarms.map((alarm) => alarm.id)).size !== alarms.length) {
    throw new Error("Alarm state file is invalid.");
  }

  return { alarms, version: 1 };
}

function parseAlarmRecord(value: unknown): AlarmRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    !isCanonicalIsoTimestamp(value.scheduledFor)
  ) {
    throw new Error("Alarm state file is invalid.");
  }

  return {
    id: value.id,
    label: value.label,
    scheduledFor: value.scheduledFor,
  };
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
    await fileSystem.mkdir(directory);
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}
