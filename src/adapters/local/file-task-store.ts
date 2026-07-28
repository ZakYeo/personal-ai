import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";

import { cloneTaskRecord } from "../../ports/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";
import {
  atomicReplaceFile,
  type AtomicFileSystem,
} from "./atomic-file-replacement.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import {
  applyTaskListRename,
  createTaskListRecord,
} from "./task-list-record.js";
import {
  applyTaskReminderAcknowledgement,
  applyTaskReminderClaim,
  applyTaskReminderDelivery,
  applyTaskUpdate,
  clearTerminalTaskReminder,
  createTaskRecord,
} from "./task-record.js";
import {
  assertTaskCapacity,
  assertTaskListCapacity,
  assertUniqueTaskListName,
  assertUniqueTaskStoreId,
  cloneTaskList,
  matchesTaskListClearSnapshot,
} from "./task-store-state.js";
import {
  assertValidTaskStateDocument,
  parseTaskState,
  type TaskStateDocument,
} from "./task-state-schema.js";

export type TaskStoreFileSystem = LocalJsonStateFileSystem;

export interface FileTaskStoreDependencies {
  createListId?: () => string;
  createTaskId?: () => string;
  fileSystem?: TaskStoreFileSystem;
}

interface FileTaskStoreOptions extends FileTaskStoreDependencies {
  filePath: string;
  now: () => Date;
}

const nodeAtomicFileSystem: AtomicFileSystem = {
  open,
  rename,
  unlink,
};

const nodeFileSystem: TaskStoreFileSystem = {
  mkdir: (path, options) => mkdir(path, options),
  readFile: (path) => readFile(path, "utf8"),
  replaceFile: (options) =>
    atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
};

export function createFileTaskStore(options: FileTaskStoreOptions): TaskStore {
  const createListId =
    options.createListId ?? (() => `task-list-${randomUUID()}`);
  const createTaskId = options.createTaskId ?? (() => `task-${randomUUID()}`);
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
    acknowledgeReminder: (request) =>
      updateTask(options.filePath, fileSystem, enqueue, request.id, (task) =>
        applyTaskReminderAcknowledgement(task, request),
      ),
    addList: (input) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        assertTaskListCapacity(state.lists);
        const name = assertUniqueTaskListName(state.lists, input.name);
        const id = createListId();
        assertUniqueTaskStoreId(state.lists, id, "Task list");
        const list = createTaskListRecord({ name }, id, options.now());
        await writeState(
          options.filePath,
          { ...state, lists: [...state.lists, list] },
          fileSystem,
        );
        return cloneTaskList(list);
      }),
    addTask: (input) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        assertTaskCapacity(state.tasks);
        if (!state.lists.some((list) => list.id === input.listId)) {
          throw new Error(`Task list ${input.listId} does not exist.`);
        }
        const id = createTaskId();
        assertUniqueTaskStoreId(state.tasks, id, "Task");
        const task = createTaskRecord(input, id, options.now());
        await writeState(
          options.filePath,
          { ...state, tasks: [...state.tasks, task] },
          fileSystem,
        );
        return cloneTaskRecord(task);
      }),
    claimReminder: (request) =>
      updateTask(options.filePath, fileSystem, enqueue, request.id, (task) =>
        applyTaskReminderClaim(task, request),
      ),
    clearList: (request) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const list = state.lists.find(
          (candidate) => candidate.id === request.listId,
        );
        if (
          !list ||
          !matchesTaskListClearSnapshot(list, state.tasks, request)
        ) {
          return;
        }
        const removed = state.tasks.filter(
          (task) => task.listId === request.listId,
        );
        const tasks = state.tasks.filter(
          (task) => task.listId !== request.listId,
        );
        await writeState(options.filePath, { ...state, tasks }, fileSystem);
        return {
          list: cloneTaskList(list),
          removed: removed.map(cloneTaskRecord),
        };
      }),
    clearTerminalRemindersBefore: (request) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        let cleared = 0;
        const tasks = state.tasks.map((task) => {
          const updated = clearTerminalTaskReminder(task, request);
          if (!updated) return task;
          cleared += 1;
          return updated;
        });
        if (cleared > 0) {
          await writeState(options.filePath, { ...state, tasks }, fileSystem);
        }
        return cleared;
      }),
    listLists: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.lists.map(cloneTaskList);
      }),
    listTasks: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.tasks.map(cloneTaskRecord);
      }),
    markReminderDelivered: (request) =>
      updateTask(options.filePath, fileSystem, enqueue, request.id, (task) =>
        applyTaskReminderDelivery(task, request),
      ),
    removeTask: (request) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const index = state.tasks.findIndex((task) => task.id === request.id);
        const current = state.tasks[index];
        if (!current || current.revision !== request.expectedRevision) return;
        const tasks = [...state.tasks];
        tasks.splice(index, 1);
        await writeState(options.filePath, { ...state, tasks }, fileSystem);
        return cloneTaskRecord(current);
      }),
    renameList: (request) =>
      updateList(
        options.filePath,
        fileSystem,
        enqueue,
        request.id,
        (list, state) => {
          const name = assertUniqueTaskListName(
            state.lists,
            request.name,
            list.id,
          );
          return applyTaskListRename(list, { ...request, name });
        },
      ),
    updateTask: (request) =>
      updateTask(options.filePath, fileSystem, enqueue, request.id, (task) =>
        applyTaskUpdate(task, request),
      ),
  };
}

function updateList(
  filePath: string,
  fileSystem: TaskStoreFileSystem,
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>,
  id: string,
  update: (
    list: TaskListRecord,
    state: TaskStateDocument,
  ) => TaskListRecord | undefined,
): Promise<TaskListRecord | undefined> {
  return enqueue(async () => {
    const state = await readState(filePath, fileSystem);
    const index = state.lists.findIndex((list) => list.id === id);
    const current = state.lists[index];
    if (!current) return;
    const updated = update(current, state);
    if (!updated) return;
    const lists = [...state.lists];
    lists[index] = updated;
    await writeState(filePath, { ...state, lists }, fileSystem);
    return cloneTaskList(updated);
  });
}

function updateTask(
  filePath: string,
  fileSystem: TaskStoreFileSystem,
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>,
  id: string,
  update: (task: TaskRecord) => TaskRecord | undefined,
): Promise<TaskRecord | undefined> {
  return enqueue(async () => {
    const state = await readState(filePath, fileSystem);
    const index = state.tasks.findIndex((task) => task.id === id);
    const current = state.tasks[index];
    if (!current) return;
    const updated = update(current);
    if (!updated) return;
    const tasks = [...state.tasks];
    tasks[index] = updated;
    await writeState(filePath, { ...state, tasks }, fileSystem);
    return cloneTaskRecord(updated);
  });
}

async function readState(
  filePath: string,
  fileSystem: TaskStoreFileSystem,
): Promise<TaskStateDocument> {
  return readLocalJsonState({
    filePath,
    fileSystem,
    invalidJsonMessage: "Task state file contains invalid JSON.",
    missingState: () => ({ version: 2, lists: [], tasks: [] }),
    parse: parseTaskState,
    readFailureMessage: "Could not read task state.",
  });
}

async function writeState(
  filePath: string,
  state: TaskStateDocument,
  fileSystem: TaskStoreFileSystem,
): Promise<void> {
  assertValidTaskStateDocument(state);
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist task state.",
    state,
  });
}
