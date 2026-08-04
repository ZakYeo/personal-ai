import { randomUUID } from "node:crypto";
import type {
  AlarmRecord,
  AlarmStore,
  NewAlarmRecord,
} from "../../ports/alarm-store.js";
import {
  applyAlarmLifecycleUpdate,
  cloneAlarmRecord,
  createScheduledAlarm,
} from "./alarm-record.js";
import { assertAlarmAddCapacity } from "./alarm-store-state.js";
import {
  parseAlarmState,
  type AlarmStateDocument,
} from "./alarm-state-schema.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import { createSerializedExecutor } from "./serialized-executor.js";

export type AlarmStoreFileSystem = LocalJsonStateFileSystem;

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

export function createFileAlarmStore(
  options: FileAlarmStoreOptions,
): AlarmStore {
  const createId = options.createId ?? randomUUID;
  const fileSystem = options.fileSystem ?? createNodeLocalJsonStateFileSystem();
  const { now } = options;
  const enqueue = createSerializedExecutor();

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
  assertAlarmAddCapacity(existing);
  if (id.length === 0 || existing.some((record) => record.id === id)) {
    throw new Error("Alarm store generated an invalid or duplicate ID.");
  }

  return createScheduledAlarm(alarm, id, now);
}

async function readState(
  filePath: string,
  fileSystem: AlarmStoreFileSystem,
): Promise<AlarmStateDocument> {
  return readLocalJsonState({
    filePath,
    fileSystem,
    invalidJsonMessage: "Alarm state file contains invalid JSON.",
    missingState: () => ({ alarms: [], version: 3 }),
    parse: parseAlarmState,
    readFailureMessage: "Could not read alarm state.",
  });
}

async function writeState(
  filePath: string,
  state: AlarmStateDocument,
  fileSystem: AlarmStoreFileSystem,
): Promise<void> {
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist alarm state.",
    state,
  });
}
