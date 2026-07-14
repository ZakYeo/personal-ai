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
  assertValidAlarmRecord,
  createScheduledAlarm,
} from "./alarm-record.js";

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
  now?: () => Date;
}

export type FileAlarmStoreDependencies = Pick<
  FileAlarmStoreOptions,
  "createId" | "fileSystem"
>;

interface AlarmStateDocument {
  alarms: AlarmRecord[];
  version: 3;
}

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
  const now = options.now ?? (() => new Date());
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

        return { ...storedAlarm };
      }),
    list: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.alarms.map((alarm) => ({ ...alarm }));
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

        return { ...updated };
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

function parseAlarmState(value: unknown): AlarmStateDocument {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !Array.isArray(value.alarms)
  ) {
    throw new Error("Alarm state file is invalid.");
  }

  const version = value.version;
  const alarms = value.alarms.map((alarm) =>
    version === 1
      ? migrateVersionOneAlarm(alarm)
      : parseAlarmRecord(alarm, version),
  );
  if (new Set(alarms.map((alarm) => alarm.id)).size !== alarms.length) {
    throw new Error("Alarm state file is invalid.");
  }

  return { alarms, version: 3 };
}

function migrateVersionOneAlarm(value: unknown): AlarmRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    !isCanonicalIsoTimestamp(value.scheduledFor)
  ) {
    throw new Error("Alarm state file is invalid.");
  }

  return {
    createdAt: value.scheduledFor,
    deliveryAttempts: 0,
    id: value.id,
    label: value.label,
    nextDeliveryAt: value.scheduledFor,
    revision: 1,
    scheduledFor: value.scheduledFor,
    status: "scheduled",
    successfulDeliveries: 0,
    updatedAt: value.scheduledFor,
  };
}

function parseAlarmRecord(value: unknown, version: 2 | 3): AlarmRecord {
  if (
    !isRecord(value) ||
    !isCanonicalIsoTimestamp(value.createdAt) ||
    !isNonNegativeInteger(value.deliveryAttempts) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    !isCanonicalIsoTimestamp(value.scheduledFor) ||
    !isAlarmStatus(value.status) ||
    !isNonNegativeInteger(value.successfulDeliveries) ||
    value.successfulDeliveries > value.deliveryAttempts ||
    !isCanonicalIsoTimestamp(value.updatedAt) ||
    !isPositiveInteger(value.revision) ||
    (value.nextDeliveryAt !== undefined &&
      !isCanonicalIsoTimestamp(value.nextDeliveryAt)) ||
    (value.terminalAt !== undefined &&
      !isCanonicalIsoTimestamp(value.terminalAt)) ||
    (value.recurrence !== undefined && !isAlarmRecurrence(value.recurrence))
  ) {
    throw new Error("Alarm state file is invalid.");
  }

  const alarm: AlarmRecord = {
    createdAt: value.createdAt,
    deliveryAttempts: value.deliveryAttempts,
    id: value.id,
    label: value.label,
    ...(value.nextDeliveryAt ? { nextDeliveryAt: value.nextDeliveryAt } : {}),
    ...(value.recurrence ? { recurrence: value.recurrence } : {}),
    revision: value.revision,
    scheduledFor: value.scheduledFor,
    status: value.status,
    successfulDeliveries: value.successfulDeliveries,
    ...(version === 3
      ? value.terminalAt
        ? { terminalAt: value.terminalAt }
        : {}
      : isTerminalAlarmStatus(value.status)
        ? { terminalAt: value.updatedAt }
        : {}),
    updatedAt: value.updatedAt,
  };

  try {
    assertValidAlarmRecord(alarm);
  } catch {
    throw new Error("Alarm state file is invalid.");
  }

  return alarm;
}

function isAlarmStatus(value: unknown): value is AlarmRecord["status"] {
  return (
    value === "scheduled" ||
    value === "snoozed" ||
    value === "ringing" ||
    value === "completed" ||
    value === "dismissed" ||
    value === "cancelled" ||
    value === "missed"
  );
}

function isTerminalAlarmStatus(status: AlarmRecord["status"]): boolean {
  return (
    status === "cancelled" ||
    status === "completed" ||
    status === "dismissed" ||
    status === "missed"
  );
}

function isAlarmRecurrence(
  value: unknown,
): value is NonNullable<AlarmRecord["recurrence"]> {
  if (
    !isRecord(value) ||
    (value.frequency !== "daily" && value.frequency !== "weekly") ||
    !isNonEmptyString(value.timeZone)
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
    return true;
  } catch {
    return false;
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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
